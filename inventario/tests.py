from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from cuentas.models import Empresa, Membresia

from .models import Lote, Movimiento, Producto, Ubicacion, stock_de

User = get_user_model()


class Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.empresa_a = Empresa.objects.create(nombre="Clínica A")
        cls.empresa_b = Empresa.objects.create(nombre="Clínica B")
        cls.admin_a = User.objects.create_user("admin_a", password="x")
        cls.lector_a = User.objects.create_user("lector_a", password="x")
        cls.admin_b = User.objects.create_user("admin_b", password="x")
        Membresia.objects.create(usuario=cls.admin_a, empresa=cls.empresa_a, rol=Membresia.Rol.ADMIN)
        Membresia.objects.create(usuario=cls.lector_a, empresa=cls.empresa_a, rol=Membresia.Rol.LECTURA)
        Membresia.objects.create(usuario=cls.admin_b, empresa=cls.empresa_b, rol=Membresia.Rol.ADMIN)

        cls.bodega_a = Ubicacion.objects.create(empresa=cls.empresa_a, nombre="Bodega")
        cls.bodega_b = Ubicacion.objects.create(empresa=cls.empresa_b, nombre="Bodega")
        cls.prod_a = Producto.objects.create(empresa=cls.empresa_a, codigo="P1", nombre="Paracetamol", stock_minimo=10)
        cls.prod_b = Producto.objects.create(empresa=cls.empresa_b, codigo="P1", nombre="Ibuprofeno")
        cls.lote_a = Lote.objects.create(
            empresa=cls.empresa_a, producto=cls.prod_a, numero="L1", vencimiento=date.today() + timedelta(days=30)
        )
        cls.lote_b = Lote.objects.create(empresa=cls.empresa_b, producto=cls.prod_b, numero="L1")


class AislamientoEntreEmpresasTests(Base):
    """Lo más importante del sistema: nadie ve ni toca datos de otra empresa."""

    def test_no_ve_productos_de_otra_empresa(self):
        self.client.force_login(self.admin_a)
        r = self.client.get(reverse("inventario:productos"))
        self.assertContains(r, "Paracetamol")
        self.assertNotContains(r, "Ibuprofeno")

    def test_detalle_de_otra_empresa_da_404(self):
        self.client.force_login(self.admin_a)
        r = self.client.get(reverse("inventario:producto_detalle", args=[self.prod_b.pk]))
        self.assertEqual(r.status_code, 404)

    def test_no_puede_editar_de_otra_empresa(self):
        self.client.force_login(self.admin_a)
        r = self.client.post(
            reverse("inventario:producto_editar", args=[self.prod_b.pk]),
            {"codigo": "X", "nombre": "Hackeado", "unidad": "u", "stock_minimo": 0},
        )
        self.assertEqual(r.status_code, 404)
        self.prod_b.refresh_from_db()
        self.assertEqual(self.prod_b.nombre, "Ibuprofeno")

    def test_no_puede_mover_lote_de_otra_empresa(self):
        self.client.force_login(self.admin_a)
        r = self.client.post(
            reverse("inventario:movimiento_nuevo"),
            {"tipo": "entrada", "lote": self.lote_b.pk, "ubicacion": self.bodega_a.pk, "cantidad": 5},
        )
        self.assertEqual(r.status_code, 200)  # el form se rechaza
        self.assertFalse(Movimiento.objects.exists())

    def test_no_puede_cambiarse_a_empresa_ajena(self):
        self.client.force_login(self.admin_a)
        r = self.client.post(reverse("cuentas:cambiar_empresa"), {"empresa": self.empresa_b.pk})
        self.assertEqual(r.status_code, 404)

    def test_mismo_codigo_permitido_en_empresas_distintas(self):
        self.assertEqual(Producto.objects.filter(codigo="P1").count(), 2)


class MovimientosTests(Base):
    def entrada(self, cantidad, tipo="entrada"):
        return self.client.post(
            reverse("inventario:movimiento_nuevo"),
            {"tipo": tipo, "lote": self.lote_a.pk, "ubicacion": self.bodega_a.pk, "cantidad": cantidad},
        )

    def test_entrada_y_salida_calculan_stock(self):
        self.client.force_login(self.admin_a)
        self.assertEqual(self.entrada(20).status_code, 302)
        self.assertEqual(self.entrada(5, "salida").status_code, 302)
        self.assertEqual(stock_de(self.lote_a, self.bodega_a), 15)
        salida = Movimiento.objects.get(tipo="salida")
        self.assertEqual(salida.cantidad, -5)
        self.assertEqual(salida.usuario, self.admin_a)
        self.assertEqual(salida.empresa, self.empresa_a)

    def test_salida_sin_stock_suficiente_se_rechaza(self):
        self.client.force_login(self.admin_a)
        self.entrada(3)
        r = self.entrada(10, "salida")
        self.assertContains(r, "Stock insuficiente")
        self.assertEqual(stock_de(self.lote_a, self.bodega_a), 3)

    def test_rol_lectura_no_puede_registrar(self):
        self.client.force_login(self.lector_a)
        self.assertEqual(self.entrada(5).status_code, 403)
        self.assertFalse(Movimiento.objects.exists())

    def test_panel_muestra_alertas(self):
        self.client.force_login(self.admin_a)
        self.entrada(4)
        r = self.client.get(reverse("inventario:panel"))
        self.assertEqual(list(r.context["bajo_minimo"]), [self.prod_a])
        self.assertEqual(list(r.context["por_vencer"]), [self.lote_a])


class ValidacionFormulariosTests(Base):
    def test_codigo_duplicado_en_misma_empresa(self):
        self.client.force_login(self.admin_a)
        r = self.client.post(
            reverse("inventario:producto_nuevo"),
            {"codigo": "P1", "nombre": "Otro", "unidad": "u", "stock_minimo": 0, "activo": "on"},
        )
        self.assertContains(r, "Ya existe")

    def test_crear_producto_asigna_empresa_actual(self):
        self.client.force_login(self.admin_b)
        self.client.post(
            reverse("inventario:producto_nuevo"),
            {"codigo": "P2", "nombre": "Gasas", "unidad": "u", "stock_minimo": 0, "activo": "on"},
        )
        self.assertEqual(Producto.objects.get(codigo="P2").empresa, self.empresa_b)

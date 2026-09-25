from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import Empresa, Membresia

User = get_user_model()


class RegistroTests(TestCase):
    def test_registro_crea_usuario_empresa_y_admin(self):
        r = self.client.post(
            reverse("cuentas:registro"),
            {
                "username": "ana",
                "email": "ana@ejemplo.cl",
                "nombre_empresa": "CESFAM Norte",
                "password1": "UnaClaveSegura.2026",
                "password2": "UnaClaveSegura.2026",
            },
        )
        self.assertRedirects(r, reverse("inventario:panel"))
        m = Membresia.objects.get(usuario__username="ana")
        self.assertEqual(m.empresa.nombre, "CESFAM Norte")
        self.assertEqual(m.rol, Membresia.Rol.ADMIN)


class MiembrosTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.empresa = Empresa.objects.create(nombre="Clínica")
        cls.otra = Empresa.objects.create(nombre="Otra")
        cls.admin = User.objects.create_user("admin", password="x")
        cls.bodega = User.objects.create_user("bodega", password="x")
        cls.m_admin = Membresia.objects.create(usuario=cls.admin, empresa=cls.empresa, rol="admin")
        cls.m_bodega = Membresia.objects.create(usuario=cls.bodega, empresa=cls.empresa, rol="bodega")
        cls.ajeno = User.objects.create_user("ajeno", password="x")
        cls.m_ajeno = Membresia.objects.create(usuario=cls.ajeno, empresa=cls.otra, rol="admin")

    def test_admin_agrega_usuario_nuevo(self):
        self.client.force_login(self.admin)
        r = self.client.post(
            reverse("cuentas:nuevo_miembro"),
            {"username": "pedro", "password": "OtraClave.Segura1", "rol": "lectura"},
        )
        self.assertRedirects(r, reverse("cuentas:miembros"))
        self.assertTrue(Membresia.objects.filter(usuario__username="pedro", empresa=self.empresa).exists())

    def test_usuario_puede_pertenecer_a_varias_empresas(self):
        self.client.force_login(self.admin)
        self.client.post(reverse("cuentas:nuevo_miembro"), {"username": "ajeno", "rol": "bodega"})
        self.assertEqual(self.ajeno.membresias.count(), 2)

    def test_bodega_no_administra_usuarios(self):
        self.client.force_login(self.bodega)
        self.assertEqual(self.client.get(reverse("cuentas:miembros")).status_code, 403)

    def test_no_se_quita_ultimo_admin(self):
        self.client.force_login(self.admin)
        self.client.post(reverse("cuentas:quitar_miembro", args=[self.m_admin.pk]))
        self.assertTrue(Membresia.objects.filter(pk=self.m_admin.pk).exists())

    def test_no_se_quita_miembro_de_otra_empresa(self):
        self.client.force_login(self.admin)
        r = self.client.post(reverse("cuentas:quitar_miembro", args=[self.m_ajeno.pk]))
        self.assertEqual(r.status_code, 404)

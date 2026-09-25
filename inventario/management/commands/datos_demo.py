from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from cuentas.models import Empresa, Membresia
from inventario.models import Lote, Movimiento, Producto, Ubicacion

User = get_user_model()

PRODUCTOS = [
    ("PAR500", "Paracetamol 500 mg", "caja 16 comprimidos", 50),
    ("IBU400", "Ibuprofeno 400 mg", "caja 20 comprimidos", 40),
    ("AMOX500", "Amoxicilina 500 mg", "caja 21 cápsulas", 30),
    ("SF500", "Suero fisiológico 0,9%", "matraz 500 ml", 100),
    ("GAS10", "Gasa estéril 10x10", "sobre 2 unidades", 200),
    ("GUANM", "Guantes de nitrilo talla M", "caja 100 unidades", 20),
    ("JER5", "Jeringa 5 ml", "unidad", 150),
]


class Command(BaseCommand):
    help = "Crea dos empresas de demostración con usuarios, productos, lotes y movimientos."

    @transaction.atomic
    def handle(self, *args, **options):
        if Empresa.objects.filter(nombre="Clínica Demo").exists():
            self.stdout.write(self.style.WARNING("Los datos de demostración ya existen."))
            return

        hoy = timezone.localdate()
        clave = "demo12345"
        for nombre_empresa, prefijo in [("Clínica Demo", "clinica"), ("Farmacia Demo", "farmacia")]:
            empresa = Empresa.objects.create(nombre=nombre_empresa)
            admin = User.objects.create_user(f"{prefijo}_admin", password=clave)
            bodega = User.objects.create_user(f"{prefijo}_bodega", password=clave)
            lector = User.objects.create_user(f"{prefijo}_lector", password=clave)
            Membresia.objects.create(usuario=admin, empresa=empresa, rol=Membresia.Rol.ADMIN)
            Membresia.objects.create(usuario=bodega, empresa=empresa, rol=Membresia.Rol.BODEGA)
            Membresia.objects.create(usuario=lector, empresa=empresa, rol=Membresia.Rol.LECTURA)

            bodega_central = Ubicacion.objects.create(empresa=empresa, nombre="Bodega central")
            botiquin = Ubicacion.objects.create(empresa=empresa, nombre="Botiquín urgencias")

            for i, (codigo, nombre, presentacion, minimo) in enumerate(PRODUCTOS):
                producto = Producto.objects.create(
                    empresa=empresa, codigo=codigo, nombre=nombre, presentacion=presentacion, stock_minimo=minimo
                )
                # Algunos lotes vencidos o por vencer para ver las alertas.
                vencimiento = hoy + timedelta(days=[-10, 45, 400, 700][i % 4])
                lote = Lote.objects.create(
                    empresa=empresa, producto=producto, numero=f"{codigo[:3]}-{2026 + i % 2}{i:02d}", vencimiento=vencimiento
                )
                entrada = minimo * (1 + i % 3) if i % 3 else minimo // 2
                Movimiento.objects.create(
                    empresa=empresa, tipo="entrada", lote=lote, ubicacion=bodega_central,
                    cantidad=entrada, documento=f"Factura {1000 + i}", usuario=bodega,
                )
                if entrada > 10:
                    Movimiento.objects.create(
                        empresa=empresa, tipo="salida", lote=lote, ubicacion=bodega_central,
                        cantidad=-(entrada // 5), nota="Despacho a botiquín", usuario=bodega,
                    )
                    Movimiento.objects.create(
                        empresa=empresa, tipo="entrada", lote=lote, ubicacion=botiquin,
                        cantidad=entrada // 5, nota="Recepción desde bodega", usuario=bodega,
                    )

        self.stdout.write(self.style.SUCCESS("Datos de demostración creados."))
        self.stdout.write(
            "Usuarios (contraseña «demo12345»): clinica_admin, clinica_bodega, clinica_lector, "
            "farmacia_admin, farmacia_bodega, farmacia_lector"
        )

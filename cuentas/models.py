from django.conf import settings
from django.db import models


class Empresa(models.Model):
    """Un cliente del sistema (clínica, farmacia, centro de salud...)."""

    nombre = models.CharField(max_length=150)
    rut = models.CharField("RUT / identificador fiscal", max_length=30, blank=True)
    activa = models.BooleanField(default=True)
    creada = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Membresia(models.Model):
    """Relaciona un usuario con una empresa y define su rol en ella."""

    class Rol(models.TextChoices):
        ADMIN = "admin", "Administrador"
        BODEGA = "bodega", "Bodega (registra movimientos)"
        LECTURA = "lectura", "Solo lectura"

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="membresias")
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name="membresias")
    rol = models.CharField(max_length=10, choices=Rol.choices, default=Rol.LECTURA)
    creada = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["usuario", "empresa"], name="membresia_unica"),
        ]

    def __str__(self):
        return f"{self.usuario} en {self.empresa} ({self.get_rol_display()})"

    @property
    def puede_editar(self):
        return self.rol in (self.Rol.ADMIN, self.Rol.BODEGA)

    @property
    def es_admin(self):
        return self.rol == self.Rol.ADMIN

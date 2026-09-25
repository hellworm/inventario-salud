from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum

from cuentas.models import Empresa


class DeEmpresa(models.Model):
    """Base para todo dato que pertenece a una empresa (cliente)."""

    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name="+")

    class Meta:
        abstract = True


class Ubicacion(DeEmpresa):
    nombre = models.CharField(max_length=100)
    descripcion = models.CharField(max_length=255, blank=True)
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ["nombre"]
        verbose_name = "ubicación"
        verbose_name_plural = "ubicaciones"
        constraints = [
            models.UniqueConstraint(fields=["empresa", "nombre"], name="ubicacion_nombre_unico"),
        ]

    def __str__(self):
        return self.nombre


class Producto(DeEmpresa):
    codigo = models.CharField("código", max_length=50)
    nombre = models.CharField(max_length=200)
    presentacion = models.CharField(
        "presentación", max_length=100, blank=True, help_text="Ej: caja 30 comprimidos 500 mg"
    )
    unidad = models.CharField(max_length=30, default="unidad")
    stock_minimo = models.PositiveIntegerField("stock mínimo", default=0)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["empresa", "codigo"], name="producto_codigo_unico"),
        ]

    def __str__(self):
        return f"{self.codigo} · {self.nombre}"

    def stock_total(self):
        return Movimiento.objects.filter(lote__producto=self).aggregate(t=Sum("cantidad"))["t"] or 0


class Lote(DeEmpresa):
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT, related_name="lotes")
    numero = models.CharField("número de lote", max_length=50)
    vencimiento = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["vencimiento", "numero"]
        constraints = [
            models.UniqueConstraint(fields=["producto", "numero"], name="lote_numero_unico"),
        ]

    def __str__(self):
        venc = self.vencimiento.strftime("%d-%m-%Y") if self.vencimiento else "sin venc."
        return f"{self.producto.nombre} · lote {self.numero} ({venc})"

    def clean(self):
        if self.producto_id and self.empresa_id and self.producto.empresa_id != self.empresa_id:
            raise ValidationError("El producto no pertenece a esta empresa.")


def stock_de(lote, ubicacion):
    """Stock actual de un lote en una ubicación (suma de todos sus movimientos)."""
    return (
        Movimiento.objects.filter(lote=lote, ubicacion=ubicacion).aggregate(t=Sum("cantidad"))["t"] or 0
    )


class Movimiento(DeEmpresa):
    """
    Cada cambio de stock queda registrado aquí. El stock nunca se guarda
    "a mano": se calcula sumando `cantidad` (positiva = entra, negativa = sale).
    """

    class Tipo(models.TextChoices):
        ENTRADA = "entrada", "Entrada"
        SALIDA = "salida", "Salida"
        AJUSTE = "ajuste", "Ajuste de inventario"

    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    lote = models.ForeignKey(Lote, on_delete=models.PROTECT, related_name="movimientos")
    ubicacion = models.ForeignKey(
        Ubicacion, on_delete=models.PROTECT, related_name="movimientos", verbose_name="ubicación"
    )
    cantidad = models.IntegerField(help_text="Positiva suma stock, negativa resta.")
    documento = models.CharField(
        max_length=100, blank=True, help_text="Guía, factura, receta u otra referencia"
    )
    nota = models.CharField(max_length=255, blank=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha", "-id"]
        indexes = [
            models.Index(fields=["empresa", "-fecha"]),
            models.Index(fields=["lote", "ubicacion"]),
        ]

    def __str__(self):
        return f"{self.get_tipo_display()} {self.cantidad:+} · {self.lote}"

    def clean(self):
        if self.empresa_id:
            if self.lote_id and self.lote.empresa_id != self.empresa_id:
                raise ValidationError("El lote no pertenece a esta empresa.")
            if self.ubicacion_id and self.ubicacion.empresa_id != self.empresa_id:
                raise ValidationError("La ubicación no pertenece a esta empresa.")
        if self.cantidad == 0:
            raise ValidationError({"cantidad": "La cantidad no puede ser cero."})
        if self.tipo == self.Tipo.ENTRADA and self.cantidad < 0:
            raise ValidationError({"cantidad": "Una entrada debe ser positiva."})
        if self.tipo == self.Tipo.SALIDA and self.cantidad > 0:
            raise ValidationError({"cantidad": "Una salida debe ser negativa."})

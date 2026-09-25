from django.contrib import admin

from .models import Lote, Movimiento, Producto, Ubicacion

# El admin de Django es para el equipo que opera la plataforma (superusuarios),
# no para los clientes: ve los datos de TODAS las empresas.


@admin.register(Ubicacion)
class UbicacionAdmin(admin.ModelAdmin):
    list_display = ["nombre", "empresa", "activa"]
    list_filter = ["empresa", "activa"]
    search_fields = ["nombre"]


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ["codigo", "nombre", "empresa", "stock_minimo", "activo"]
    list_filter = ["empresa", "activo"]
    search_fields = ["codigo", "nombre"]


@admin.register(Lote)
class LoteAdmin(admin.ModelAdmin):
    list_display = ["numero", "producto", "vencimiento", "empresa"]
    list_filter = ["empresa"]
    search_fields = ["numero", "producto__nombre"]


@admin.register(Movimiento)
class MovimientoAdmin(admin.ModelAdmin):
    list_display = ["fecha", "tipo", "lote", "ubicacion", "cantidad", "usuario", "empresa"]
    list_filter = ["empresa", "tipo"]
    search_fields = ["lote__numero", "lote__producto__nombre", "documento"]

    # El historial de movimientos no se edita ni se borra: es la auditoría.
    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

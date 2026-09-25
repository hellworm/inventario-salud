from django.contrib import admin

from .models import Empresa, Membresia


class MembresiaInline(admin.TabularInline):
    model = Membresia
    extra = 0
    autocomplete_fields = ["usuario"]


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ["nombre", "rut", "activa", "creada"]
    list_filter = ["activa"]
    search_fields = ["nombre", "rut"]
    inlines = [MembresiaInline]


@admin.register(Membresia)
class MembresiaAdmin(admin.ModelAdmin):
    list_display = ["usuario", "empresa", "rol", "creada"]
    list_filter = ["rol", "empresa"]
    search_fields = ["usuario__username", "empresa__nombre"]

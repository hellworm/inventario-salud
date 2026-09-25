from django.urls import path

from . import views

app_name = "cuentas"

urlpatterns = [
    path("registro/", views.RegistroView.as_view(), name="registro"),
    path("sin-empresa/", views.sin_empresa, name="sin_empresa"),
    path("cambiar-empresa/", views.cambiar_empresa, name="cambiar_empresa"),
    path("miembros/", views.MiembrosView.as_view(), name="miembros"),
    path("miembros/nuevo/", views.NuevoMiembroView.as_view(), name="nuevo_miembro"),
    path("miembros/<int:pk>/editar/", views.EditarMiembroView.as_view(), name="editar_miembro"),
    path("miembros/<int:pk>/quitar/", views.QuitarMiembroView.as_view(), name="quitar_miembro"),
]

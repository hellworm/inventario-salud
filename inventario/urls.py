from django.urls import path

from . import views

app_name = "inventario"

urlpatterns = [
    path("", views.PanelView.as_view(), name="panel"),
    path("stock/", views.StockView.as_view(), name="stock"),
    path("productos/", views.ProductoListView.as_view(), name="productos"),
    path("productos/nuevo/", views.ProductoCreateView.as_view(), name="producto_nuevo"),
    path("productos/<int:pk>/", views.ProductoDetailView.as_view(), name="producto_detalle"),
    path("productos/<int:pk>/editar/", views.ProductoUpdateView.as_view(), name="producto_editar"),
    path("lotes/", views.LoteListView.as_view(), name="lotes"),
    path("lotes/nuevo/", views.LoteCreateView.as_view(), name="lote_nuevo"),
    path("lotes/<int:pk>/editar/", views.LoteUpdateView.as_view(), name="lote_editar"),
    path("ubicaciones/", views.UbicacionListView.as_view(), name="ubicaciones"),
    path("ubicaciones/nueva/", views.UbicacionCreateView.as_view(), name="ubicacion_nueva"),
    path("ubicaciones/<int:pk>/editar/", views.UbicacionUpdateView.as_view(), name="ubicacion_editar"),
    path("movimientos/", views.MovimientoListView.as_view(), name="movimientos"),
    path("movimientos/nuevo/", views.MovimientoCreateView.as_view(), name="movimiento_nuevo"),
]

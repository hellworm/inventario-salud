from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.db import transaction
from django.db.models import F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.views.generic import CreateView, DetailView, ListView, TemplateView, UpdateView

from cuentas.mixins import DeEmpresaMixin, EmpresaRequeridaMixin

from .forms import LoteForm, MovimientoForm, ProductoForm, UbicacionForm
from .models import Lote, Movimiento, Producto, Ubicacion, stock_de


def productos_con_stock(empresa):
    return Producto.objects.filter(empresa=empresa).annotate(
        stock=Coalesce(Sum("lotes__movimientos__cantidad"), Value(0))
    )


def lotes_con_stock(empresa):
    return (
        Lote.objects.filter(empresa=empresa)
        .select_related("producto")
        .annotate(stock=Coalesce(Sum("movimientos__cantidad"), Value(0)))
    )


class PanelView(EmpresaRequeridaMixin, TemplateView):
    template_name = "inventario/panel.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        empresa = self.request.empresa
        hoy = timezone.localdate()
        limite = hoy + timedelta(days=settings.DIAS_ALERTA_VENCIMIENTO)
        lotes = lotes_con_stock(empresa).filter(stock__gt=0, vencimiento__isnull=False)
        ctx.update(
            {
                "hoy": hoy,
                "dias_alerta": settings.DIAS_ALERTA_VENCIMIENTO,
                "total_productos": Producto.objects.filter(empresa=empresa, activo=True).count(),
                "bajo_minimo": productos_con_stock(empresa)
                .filter(activo=True, stock__lt=F("stock_minimo"))
                .order_by("nombre"),
                "vencidos": lotes.filter(vencimiento__lt=hoy),
                "por_vencer": lotes.filter(vencimiento__gte=hoy, vencimiento__lte=limite),
                "ultimos_movimientos": Movimiento.objects.filter(empresa=empresa).select_related(
                    "lote__producto", "ubicacion", "usuario"
                )[:10],
            }
        )
        return ctx


# ---------- Productos ----------


class ProductoListView(EmpresaRequeridaMixin, ListView):
    template_name = "inventario/producto_list.html"
    context_object_name = "productos"
    paginate_by = 50

    def get_queryset(self):
        qs = productos_con_stock(self.request.empresa)
        q = self.request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(codigo__icontains=q))
        return qs.order_by("nombre")


class ProductoDetailView(DeEmpresaMixin, DetailView):
    model = Producto
    template_name = "inventario/producto_detail.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["stock_por_lote"] = (
            Movimiento.objects.filter(lote__producto=self.object)
            .values("lote__pk", "lote__numero", "lote__vencimiento", "ubicacion__nombre")
            .annotate(stock=Sum("cantidad"))
            .exclude(stock=0)
            .order_by("lote__vencimiento", "lote__numero", "ubicacion__nombre")
        )
        ctx["stock_total"] = self.object.stock_total()
        return ctx


class ProductoCreateView(DeEmpresaMixin, CreateView):
    rol_minimo = "editar"
    model = Producto
    form_class = ProductoForm
    template_name = "form.html"
    extra_context = {"titulo": "Nuevo producto"}

    def get_success_url(self):
        return reverse("inventario:producto_detalle", args=[self.object.pk])


class ProductoUpdateView(DeEmpresaMixin, UpdateView):
    rol_minimo = "editar"
    model = Producto
    form_class = ProductoForm
    template_name = "form.html"
    extra_context = {"titulo": "Editar producto"}

    def get_success_url(self):
        return reverse("inventario:producto_detalle", args=[self.object.pk])


# ---------- Lotes ----------


class LoteListView(EmpresaRequeridaMixin, ListView):
    template_name = "inventario/lote_list.html"
    context_object_name = "lotes"
    paginate_by = 50

    def get_queryset(self):
        qs = lotes_con_stock(self.request.empresa)
        if self.request.GET.get("todos") != "1":
            qs = qs.filter(stock__gt=0)
        q = self.request.GET.get("q", "").strip()
        if q:
            qs = qs.filter(Q(numero__icontains=q) | Q(producto__nombre__icontains=q) | Q(producto__codigo__icontains=q))
        return qs.order_by(F("vencimiento").asc(nulls_last=True), "producto__nombre")

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["hoy"] = timezone.localdate()
        ctx["limite"] = ctx["hoy"] + timedelta(days=settings.DIAS_ALERTA_VENCIMIENTO)
        return ctx


class LoteCreateView(DeEmpresaMixin, CreateView):
    rol_minimo = "editar"
    model = Lote
    form_class = LoteForm
    template_name = "form.html"
    extra_context = {"titulo": "Nuevo lote"}
    success_url = reverse_lazy("inventario:lotes")

    def get_initial(self):
        return {"producto": self.request.GET.get("producto")}


class LoteUpdateView(DeEmpresaMixin, UpdateView):
    rol_minimo = "editar"
    model = Lote
    form_class = LoteForm
    template_name = "form.html"
    extra_context = {"titulo": "Editar lote"}
    success_url = reverse_lazy("inventario:lotes")


# ---------- Ubicaciones ----------


class UbicacionListView(DeEmpresaMixin, ListView):
    model = Ubicacion
    template_name = "inventario/ubicacion_list.html"
    context_object_name = "ubicaciones"


class UbicacionCreateView(DeEmpresaMixin, CreateView):
    rol_minimo = "editar"
    model = Ubicacion
    form_class = UbicacionForm
    template_name = "form.html"
    extra_context = {"titulo": "Nueva ubicación"}
    success_url = reverse_lazy("inventario:ubicaciones")


class UbicacionUpdateView(DeEmpresaMixin, UpdateView):
    rol_minimo = "editar"
    model = Ubicacion
    form_class = UbicacionForm
    template_name = "form.html"
    extra_context = {"titulo": "Editar ubicación"}
    success_url = reverse_lazy("inventario:ubicaciones")


# ---------- Movimientos y stock ----------


class MovimientoListView(EmpresaRequeridaMixin, ListView):
    template_name = "inventario/movimiento_list.html"
    context_object_name = "movimientos"
    paginate_by = 50

    def get_queryset(self):
        qs = Movimiento.objects.filter(empresa=self.request.empresa).select_related(
            "lote__producto", "ubicacion", "usuario"
        )
        tipo = self.request.GET.get("tipo")
        if tipo in Movimiento.Tipo.values:
            qs = qs.filter(tipo=tipo)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["tipos"] = Movimiento.Tipo.choices
        ctx["tipo_actual"] = self.request.GET.get("tipo", "")
        return ctx


class MovimientoCreateView(DeEmpresaMixin, CreateView):
    rol_minimo = "editar"
    model = Movimiento
    form_class = MovimientoForm
    template_name = "form.html"
    extra_context = {"titulo": "Registrar movimiento"}
    success_url = reverse_lazy("inventario:movimientos")

    def get_initial(self):
        return {k: self.request.GET.get(k) for k in ("tipo", "lote", "ubicacion") if self.request.GET.get(k)}

    def form_valid(self, form):
        form.instance.usuario = self.request.user
        with transaction.atomic():
            # Bloquea el lote para que dos salidas simultáneas no dejen el stock negativo.
            lote = Lote.objects.select_for_update().get(pk=form.instance.lote_id)
            cantidad = form.cleaned_data["cantidad"]
            if cantidad < 0:
                disponible = stock_de(lote, form.cleaned_data["ubicacion"])
                if disponible + cantidad < 0:
                    form.add_error("cantidad", f"Stock insuficiente: hay {disponible}.")
                    return self.form_invalid(form)
            respuesta = super().form_valid(form)
        messages.success(self.request, f"Movimiento registrado: {self.object}")
        return respuesta


class StockView(EmpresaRequeridaMixin, TemplateView):
    template_name = "inventario/stock.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        filas = (
            Movimiento.objects.filter(empresa=self.request.empresa)
            .values(
                "lote__producto__pk",
                "lote__producto__codigo",
                "lote__producto__nombre",
                "lote__producto__unidad",
                "lote__numero",
                "lote__vencimiento",
                "ubicacion__nombre",
            )
            .annotate(stock=Sum("cantidad"))
            .exclude(stock=0)
            .order_by("lote__producto__nombre", "lote__vencimiento", "ubicacion__nombre")
        )
        ubicacion = self.request.GET.get("ubicacion", "")
        if ubicacion.isdigit():
            filas = filas.filter(ubicacion_id=ubicacion)
        ctx["filas"] = filas
        ctx["ubicaciones"] = Ubicacion.objects.filter(empresa=self.request.empresa)
        ctx["ubicacion_actual"] = ubicacion or ""
        ctx["hoy"] = timezone.localdate()
        return ctx

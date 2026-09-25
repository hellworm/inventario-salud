from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.views import View
from django.views.decorators.http import require_POST
from django.views.generic import FormView, ListView, UpdateView

from .forms import MembresiaRolForm, NuevoMiembroForm, RegistroForm
from .middleware import SESSION_KEY
from .mixins import EmpresaRequeridaMixin
from .models import Empresa, Membresia


class RegistroView(FormView):
    template_name = "cuentas/registro.html"
    form_class = RegistroForm
    success_url = reverse_lazy("inventario:panel")

    @transaction.atomic
    def form_valid(self, form):
        usuario = form.save()
        empresa = Empresa.objects.create(nombre=form.cleaned_data["nombre_empresa"])
        Membresia.objects.create(usuario=usuario, empresa=empresa, rol=Membresia.Rol.ADMIN)
        login(self.request, usuario)
        self.request.session[SESSION_KEY] = empresa.pk
        messages.success(self.request, f"¡Bienvenido! Se creó la empresa «{empresa.nombre}».")
        return super().form_valid(form)


@login_required
def sin_empresa(request):
    if request.membresia is not None:
        return redirect("inventario:panel")
    return render(request, "cuentas/sin_empresa.html")


@login_required
@require_POST
def cambiar_empresa(request):
    membresia = get_object_or_404(
        Membresia, usuario=request.user, empresa_id=request.POST.get("empresa"), empresa__activa=True
    )
    request.session[SESSION_KEY] = membresia.empresa_id
    return redirect("inventario:panel")


class MiembrosView(EmpresaRequeridaMixin, ListView):
    rol_minimo = "admin"
    template_name = "cuentas/miembros.html"
    context_object_name = "miembros"

    def get_queryset(self):
        return (
            Membresia.objects.filter(empresa=self.request.empresa)
            .select_related("usuario")
            .order_by("usuario__username")
        )


class NuevoMiembroView(EmpresaRequeridaMixin, FormView):
    rol_minimo = "admin"
    template_name = "form.html"
    form_class = NuevoMiembroForm
    success_url = reverse_lazy("cuentas:miembros")
    extra_context = {"titulo": "Agregar miembro"}

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["empresa"] = self.request.empresa
        return kwargs

    def form_valid(self, form):
        membresia = form.save()
        messages.success(self.request, f"{membresia.usuario.username} ahora es parte de la empresa.")
        return super().form_valid(form)


def _es_ultimo_admin(membresia):
    return (
        membresia.rol == Membresia.Rol.ADMIN
        and not Membresia.objects.filter(empresa=membresia.empresa, rol=Membresia.Rol.ADMIN)
        .exclude(pk=membresia.pk)
        .exists()
    )


class EditarMiembroView(EmpresaRequeridaMixin, UpdateView):
    rol_minimo = "admin"
    template_name = "form.html"
    form_class = MembresiaRolForm
    success_url = reverse_lazy("cuentas:miembros")

    def get_queryset(self):
        return Membresia.objects.filter(empresa=self.request.empresa)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["titulo"] = f"Rol de {self.object.usuario.username}"
        return ctx

    def form_valid(self, form):
        original = Membresia.objects.get(pk=self.object.pk)
        if _es_ultimo_admin(original) and form.cleaned_data["rol"] != Membresia.Rol.ADMIN:
            form.add_error("rol", "La empresa debe tener al menos un administrador.")
            return self.form_invalid(form)
        return super().form_valid(form)


class QuitarMiembroView(EmpresaRequeridaMixin, View):
    rol_minimo = "admin"

    def post(self, request, pk):
        membresia = get_object_or_404(Membresia, pk=pk, empresa=request.empresa)
        if _es_ultimo_admin(membresia):
            messages.error(request, "No puedes quitar al único administrador.")
        else:
            membresia.delete()
            messages.success(request, f"Se quitó a {membresia.usuario.username} de la empresa.")
        return redirect("cuentas:miembros")

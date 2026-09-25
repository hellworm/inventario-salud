from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect


class EmpresaRequeridaMixin(LoginRequiredMixin):
    """
    Exige usuario autenticado con una empresa activa.

    `rol_minimo` controla qué pueden hacer:
      - "lectura": cualquier miembro
      - "editar":  admin o bodega
      - "admin":   solo administradores de la empresa
    """

    rol_minimo = "lectura"

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return self.handle_no_permission()
        if request.membresia is None:
            return redirect("cuentas:sin_empresa")
        if self.rol_minimo == "editar" and not request.membresia.puede_editar:
            raise PermissionDenied("Tu rol no permite modificar datos.")
        if self.rol_minimo == "admin" and not request.membresia.es_admin:
            raise PermissionDenied("Solo administradores de la empresa.")
        return super().dispatch(request, *args, **kwargs)


class DeEmpresaMixin(EmpresaRequeridaMixin):
    """
    Para vistas basadas en modelos con campo `empresa`:
    filtra el queryset por la empresa actual y la asigna al crear.

    Es la pieza clave del aislamiento entre clientes: cualquier vista que
    use este mixin solo puede ver o tocar registros de su propia empresa.
    """

    def get_queryset(self):
        return super().get_queryset().filter(empresa=self.request.empresa)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["empresa"] = self.request.empresa
        return kwargs

    def form_valid(self, form):
        form.instance.empresa = self.request.empresa
        return super().form_valid(form)

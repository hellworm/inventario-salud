from .models import Membresia

SESSION_KEY = "empresa_id"


class EmpresaActualMiddleware:
    """
    Determina la empresa con la que está trabajando el usuario.

    Deja en el request:
      - request.membresia: la Membresia activa (o None)
      - request.empresa:   la Empresa activa (o None)

    La empresa elegida se guarda en la sesión, pero siempre se valida contra
    las membresías del usuario, así nunca se puede "saltar" a otra empresa.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.membresia = None
        request.empresa = None

        if request.user.is_authenticated:
            membresias = Membresia.objects.filter(usuario=request.user, empresa__activa=True).select_related("empresa")
            empresa_id = request.session.get(SESSION_KEY)
            membresia = None
            if empresa_id:
                membresia = membresias.filter(empresa_id=empresa_id).first()
            if membresia is None:
                membresia = membresias.order_by("empresa__nombre").first()
                if membresia:
                    request.session[SESSION_KEY] = membresia.empresa_id
                else:
                    request.session.pop(SESSION_KEY, None)
            if membresia:
                request.membresia = membresia
                request.empresa = membresia.empresa

        return self.get_response(request)

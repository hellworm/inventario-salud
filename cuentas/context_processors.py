def empresa(request):
    membresia = getattr(request, "membresia", None)
    otras = []
    if membresia is not None:
        otras = [m for m in request.user.membresias.select_related("empresa").filter(empresa__activa=True) if m.pk != membresia.pk]
    return {
        "empresa_actual": getattr(request, "empresa", None),
        "membresia_actual": membresia,
        "otras_membresias": otras,
    }

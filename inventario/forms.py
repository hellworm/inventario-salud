from django import forms

from .models import Lote, Movimiento, Producto, Ubicacion, stock_de


class DeEmpresaForm(forms.ModelForm):
    """
    ModelForm que conoce la empresa actual: la asigna a la instancia y
    limita todos los desplegables (ForeignKey) a registros de esa empresa.
    """

    def __init__(self, *args, empresa, **kwargs):
        super().__init__(*args, **kwargs)
        self.empresa = empresa
        self.instance.empresa = empresa
        for campo in self.fields.values():
            if isinstance(campo, forms.ModelChoiceField):
                modelo = campo.queryset.model
                if any(f.name == "empresa" for f in modelo._meta.fields):
                    campo.queryset = campo.queryset.filter(empresa=empresa)

    def _validar_unico(self, campo, **filtros):
        """Las restricciones únicas incluyen `empresa`, que no está en el form; se validan aquí."""
        valor = self.cleaned_data.get(campo)
        qs = self._meta.model.objects.filter(**filtros, **{campo: valor})
        if self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if valor and qs.exists():
            raise forms.ValidationError("Ya existe un registro con este valor.")
        return valor


class UbicacionForm(DeEmpresaForm):
    class Meta:
        model = Ubicacion
        fields = ["nombre", "descripcion", "activa"]

    def clean_nombre(self):
        return self._validar_unico("nombre", empresa=self.empresa)


class ProductoForm(DeEmpresaForm):
    class Meta:
        model = Producto
        fields = ["codigo", "nombre", "presentacion", "unidad", "stock_minimo", "activo"]

    def clean_codigo(self):
        return self._validar_unico("codigo", empresa=self.empresa)


class LoteForm(DeEmpresaForm):
    class Meta:
        model = Lote
        fields = ["producto", "numero", "vencimiento"]
        widgets = {"vencimiento": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d")}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["producto"].queryset = self.fields["producto"].queryset.filter(activo=True)

    def clean(self):
        datos = super().clean()
        producto, numero = datos.get("producto"), datos.get("numero")
        if producto and numero:
            qs = Lote.objects.filter(producto=producto, numero=numero)
            if self.instance.pk:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                self.add_error("numero", "Este producto ya tiene un lote con ese número.")
        return datos


class MovimientoForm(DeEmpresaForm):
    cantidad = forms.IntegerField(
        help_text="Escribe la cantidad en positivo. Solo en ajustes puedes usar negativo para restar."
    )

    class Meta:
        model = Movimiento
        fields = ["tipo", "lote", "ubicacion", "cantidad", "documento", "nota"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["lote"].queryset = self.fields["lote"].queryset.select_related("producto").filter(
            producto__activo=True
        )
        self.fields["ubicacion"].queryset = self.fields["ubicacion"].queryset.filter(activa=True)

    def clean(self):
        datos = super().clean()
        tipo, cantidad = datos.get("tipo"), datos.get("cantidad")
        if tipo is None or cantidad is None:
            return datos
        if cantidad == 0:
            self.add_error("cantidad", "La cantidad no puede ser cero.")
            return datos
        if tipo == Movimiento.Tipo.ENTRADA:
            if cantidad < 0:
                self.add_error("cantidad", "Una entrada debe ser positiva.")
                return datos
        elif tipo == Movimiento.Tipo.SALIDA:
            cantidad = -abs(cantidad)
        datos["cantidad"] = cantidad
        self.instance.cantidad = cantidad

        lote, ubicacion = datos.get("lote"), datos.get("ubicacion")
        if lote and ubicacion and cantidad < 0:
            disponible = stock_de(lote, ubicacion)
            if disponible + cantidad < 0:
                self.add_error("cantidad", f"Stock insuficiente: hay {disponible} en {ubicacion}.")
        return datos

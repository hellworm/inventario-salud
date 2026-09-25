from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.password_validation import validate_password

from .models import Membresia

User = get_user_model()


class RegistroForm(UserCreationForm):
    """Crea un usuario nuevo junto con su empresa (queda como administrador)."""

    nombre_empresa = forms.CharField(label="Nombre de la empresa o centro", max_length=150)
    email = forms.EmailField(label="Correo")

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "email")


class NuevoMiembroForm(forms.Form):
    """Agrega un usuario a la empresa. Si no existe, lo crea con la contraseña indicada."""

    username = forms.CharField(label="Usuario", max_length=150)
    email = forms.EmailField(label="Correo", required=False)
    password = forms.CharField(
        label="Contraseña inicial",
        widget=forms.PasswordInput,
        required=False,
        help_text="Solo si el usuario es nuevo.",
    )
    rol = forms.ChoiceField(choices=Membresia.Rol.choices)

    def __init__(self, *args, empresa=None, **kwargs):
        self.empresa = empresa
        super().__init__(*args, **kwargs)

    def clean(self):
        datos = super().clean()
        username = datos.get("username")
        if not username:
            return datos
        usuario = User.objects.filter(username=username).first()
        if usuario is None:
            if not datos.get("password"):
                self.add_error("password", "El usuario no existe: indica una contraseña inicial para crearlo.")
            else:
                try:
                    validate_password(datos["password"])
                except forms.ValidationError as e:
                    self.add_error("password", e)
        elif Membresia.objects.filter(usuario=usuario, empresa=self.empresa).exists():
            self.add_error("username", "Ese usuario ya pertenece a esta empresa.")
        datos["usuario_existente"] = usuario
        return datos

    def save(self):
        datos = self.cleaned_data
        usuario = datos["usuario_existente"]
        if usuario is None:
            usuario = User.objects.create_user(
                username=datos["username"], email=datos.get("email", ""), password=datos["password"]
            )
        return Membresia.objects.create(usuario=usuario, empresa=self.empresa, rol=datos["rol"])


class MembresiaRolForm(forms.ModelForm):
    class Meta:
        model = Membresia
        fields = ["rol"]

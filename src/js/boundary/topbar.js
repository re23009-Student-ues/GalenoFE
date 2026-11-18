import './componentes/instalador_app.js';

/**
 * Muestra en la barra superior quién tiene la sesión abierta.
 * @param {Object} usuario persona_rol de la sesión
 */
function pintarUsuario(usuario, raiz) {
  const p = usuario.idPersona ?? {};
  raiz.querySelector("#usuario-nombre").textContent =
    `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || "Sin nombre";
  raiz.querySelector("#usuario-detalle").textContent =
    `${usuario.idRol?.nombre ?? ""} · ${usuario.idClinica?.nombre ?? ""}`;
  raiz.querySelector("#usuario-avatar").textContent =
    `${(p.nombres ?? "?")[0]}${(p.apellidos ?? "")[0] ?? ""}`.toUpperCase();
}

class GalenoTopbar extends HTMLElement {
    connectedCallback() {
        if (!this.tituloEl) {
            const encabezado = document.createElement('header');
            encabezado.className = 'topbar';
            const titulo = document.createElement('h1');
            titulo.id = 'titulo-pagina';
            const instalador = document.createElement('instalador-app');
            const controles = document.createElement('div');
            controles.className = 'topbar-controles';
            encabezado.append(titulo, instalador, controles);
            this.replaceChildren(encabezado);
        }
        this.pintar();
    }
    get tituloEl() { return this.querySelector('#titulo-pagina'); }
    set usuario(valor) { this._usuario = valor; this.pintar(); }
    get usuario() { return this._usuario; }

    pintar() {
        const controles = this.querySelector('.topbar-controles');
        if (!controles) return;
        this.tituloEl.hidden = !this.usuario;
        if (this.usuario) {
            if (!controles.querySelector('.usuario')) this.montarPersonal(controles);
            pintarUsuario(this.usuario, controles);
        } else if (!controles.firstElementChild?.matches('a')) {
            this.montarPublico(controles);
        }
    }

    montarPublico(controles) {
        const citas = document.createElement('a');
        citas.href = '#/citas';
        citas.setAttribute('aria-label', 'GalenoSV: búsqueda de citas');
        const logo = document.createElement('img');
        logo.className = 'logo-publico';
        logo.src = 'Recursos/imagenes/logo.png';
        logo.alt = 'GalenoSV';
        citas.append(logo);
        const acceso = document.createElement('a');
        acceso.href = '#/login';
        acceso.textContent = 'Acceso del personal';
        controles.replaceChildren(citas, acceso);
    }

    montarPersonal(controles) {
        const menu = document.createElement('button');
        menu.id = 'btn-menu-movil';
        menu.className = 'menu-movil';
        menu.type = 'button';
        menu.setAttribute('aria-label', 'Abrir menú');
        menu.textContent = '☰';
        menu.addEventListener('click', e => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent('galeno-alternar-menu', { bubbles: true, composed: true }));
        });

        const usuario = document.createElement('div');
        usuario.className = 'usuario';
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.id = 'usuario-avatar';
        const datos = document.createElement('div');
        datos.className = 'usuario-datos';
        const nombre = document.createElement('strong');
        nombre.id = 'usuario-nombre';
        const detalle = document.createElement('small');
        detalle.id = 'usuario-detalle';
        datos.append(nombre, detalle);
        const salir = document.createElement('button');
        salir.id = 'btn-salir';
        salir.className = 'btn-salir';
        salir.type = 'button';
        salir.textContent = 'Cerrar sesión';
        salir.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('galeno-cerrar-sesion', { bubbles: true, composed: true }));
        });

        usuario.append(avatar, datos, salir);
        controles.replaceChildren(menu, usuario);
    }
}
customElements.define('galeno-topbar', GalenoTopbar);

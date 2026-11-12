/**
 * Muestra en la barra superior quién tiene la sesión abierta.
 * @param {Object} usuario persona_rol de la sesión
 */
export function pintarUsuario(usuario, raiz = document) {
  const p = usuario.idPersona ?? {};
  raiz.querySelector("#usuario-nombre").textContent =
    `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || "Sin nombre";
  raiz.querySelector("#usuario-detalle").textContent =
    `${usuario.idRol?.nombre ?? ""} · ${usuario.idClinica?.nombre ?? ""}`;
  raiz.querySelector("#usuario-avatar").textContent =
    `${(p.nombres ?? "?")[0]}${(p.apellidos ?? "")[0] ?? ""}`.toUpperCase();
}

class GalenoTopbar extends HTMLElement {
    static get observedAttributes() { return ['titulo']; }

    connectedCallback() {
        this.innerHTML = `<header class="topbar"><h1 id="titulo-pagina"></h1><div class="topbar-controles"></div></header>`;
        this.attributeChangedCallback();
        this.pintar();
    }
    attributeChangedCallback() {
        if (this.tituloEl) this.tituloEl.textContent = this.getAttribute('titulo') ?? '';
    }
    get tituloEl() { return this.querySelector('#titulo-pagina'); }
    set usuario(valor) { this._usuario = valor; this.pintar(); }
    get usuario() { return this._usuario; }

    pintar() {
        const controles = this.querySelector('.topbar-controles');
        if (!controles) return;
        this.tituloEl.hidden = !this.usuario;
        if (!this.usuario) {
            controles.innerHTML = `<a href="#/citas" aria-label="GalenoSV: búsqueda de citas"><img class="logo-publico" src="Recursos/imagenes/logo.png" alt="GalenoSV" /></a>
                <a href="#/login">Acceso del personal</a>`;
            return;
        }
        controles.innerHTML = `<button id="btn-menu-movil" class="menu-movil" aria-label="Abrir menú" type="button">☰</button>
            <div class="usuario"><div class="avatar" id="usuario-avatar"></div><div class="usuario-datos">
            <strong id="usuario-nombre"></strong><small id="usuario-detalle"></small></div>
            <button class="btn-salir" id="btn-salir" type="button">Cerrar sesión</button></div>`;
        pintarUsuario(this.usuario, this);
        this.querySelector('#btn-menu-movil').addEventListener('click', e => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent('galeno-alternar-menu', { bubbles: true, composed: true }));
        });
        this.querySelector('#btn-salir').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('galeno-cerrar-sesion', { bubbles: true, composed: true }));
        });
    }
}
customElements.define('galeno-topbar', GalenoTopbar);

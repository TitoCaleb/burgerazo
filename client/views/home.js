import { esc } from '../ui.js';

export function renderHome(root, { savedName, prefillCode, busy }, actions) {
  root.innerHTML = `
  <main class="screen home">
    <header class="hero">
      <div class="hero__logo" aria-hidden="true">🍔</div>
      <h1>Burgerazo</h1>
      <p class="hero__tag">Arma tu hamburguesa antes que nadie. Sabotea las de tus amigos.</p>
    </header>

    <form class="panel" id="home-form" autocomplete="off">
      <label class="field">
        <span>Tu nombre</span>
        <input id="name" maxlength="20" required value="${esc(savedName)}" placeholder="Ej: Ana" />
      </label>
      <button class="btn btn--primary" type="submit" data-act="create" ${busy ? 'disabled' : ''}>
        Crear sala
      </button>
      <div class="divider"><span>o únete a una</span></div>
      <div class="join-row">
        <label class="field field--code">
          <span>Código</span>
          <input id="code" maxlength="4" value="${esc(prefillCode)}" placeholder="ABCD"
            autocapitalize="characters" inputmode="text" />
        </label>
        <button class="btn" type="button" data-act="join" ${busy ? 'disabled' : ''}>Unirse</button>
      </div>
    </form>

    <details class="panel rules">
      <summary>¿Cómo se juega?</summary>
      <p>Gana quien tenga en su plato los 4 ingredientes 🥩 🧀 🥬 🍅 <strong>sin plagas</strong>.</p>
      <ul>
        <li>En tu turno: juega 1 carta <em>o</em> tira de 1 a 3 cartas. Luego robas hasta tener 3.</li>
        <li>🪰 <strong>Plaga</strong>: sobre un ingrediente rival. Si ya tenía plaga, se echa a perder.</li>
        <li>❄️ <strong>Frío</strong>: sobre tu ingrediente. Cura plagas; con 2 queda 🧊 congelado e intocable.</li>
        <li>🐀 Rata y 🧊 Nevera sirven para cualquier ingrediente.</li>
        <li>Cartas especiales: 🔄 Cambio de pedido, 💥 ¡Se cayó al piso!, 📋 Inspección sanitaria, ⏰ Hora pico, 🍟 Plato del día.</li>
      </ul>
    </details>
  </main>`;

  const form = root.querySelector('#home-form');
  const nameInput = root.querySelector('#name');
  const codeInput = root.querySelector('#code');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    actions.create(nameInput.value);
  });
  root.querySelector('[data-act="join"]').addEventListener('click', () => {
    if (!nameInput.reportValidity()) return;
    actions.join(codeInput.value, nameInput.value);
  });
}

export const LoginView = {
  emits: ['login', 'update:email', 'update:password'],
  props: { loggedIn: Boolean, email: String, password: String, loading: Boolean, error: String, notice: String },
  template: `
      <section v-if="!loggedIn" class="login-card">
        <div class="brand">Chat<span>Salles</span></div>
        <p class="muted">Frontend Node.js independente do Rails</p>
        <form @submit.prevent="$emit('login')">
          <label>E-mail<input :value="email" type="email" required @input="$emit('update:email', $event.target.value)" /></label>
          <label>Senha<input :value="password" type="password" required @input="$emit('update:password', $event.target.value)" /></label>
          <button :disabled="loading">{{ loading ? 'Entrando...' : 'Entrar' }}</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      </section>
  `,
};

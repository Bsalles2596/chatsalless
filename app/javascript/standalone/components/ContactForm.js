export const ContactForm = {
  props: {
    open: { type: Boolean, default: false },
    editingId: { type: String, default: null },
    form: { type: Object, required: true },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
  },
  emits: ['submit', 'cancel', 'update:form'],
  template: `
    <div v-if="open" class="modal-backdrop">
      <form class="modal" @submit.prevent="$emit('submit')">
        <h2>{{ editingId ? 'Editar contato' : 'Novo contato' }}</h2>
        <label>Nome<input :value="form.name" required @input="$emit('update:form', { ...form, name: $event.target.value })" /></label>
        <label>E-mail<input type="email" :value="form.email" @input="$emit('update:form', { ...form, email: $event.target.value })" /></label>
        <label>Telefone<input :value="form.phoneNumber" @input="$emit('update:form', { ...form, phoneNumber: $event.target.value })" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="modal-actions">
          <button type="button" class="secondary" @click="$emit('cancel')">Cancelar</button>
          <button :disabled="loading">{{ loading ? 'Salvando...' : 'Salvar' }}</button>
        </div>
      </form>
    </div>
  `,
};

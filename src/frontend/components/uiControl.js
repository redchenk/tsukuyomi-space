const variants = ['primary', 'secondary', 'accent', 'ghost', 'quiet', 'danger', 'choice', 'icon'];
export const actionVariant = { type: String, default: 'secondary', validator: value => variants.includes(value) };
export const actionSize = { type: String, default: 'md', validator: value => ['sm', 'md', 'lg'].includes(value) };

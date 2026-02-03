import { es } from 'date-fns/locale'
import { enUS } from 'date-fns/locale'
import i18n from './index'

const localeMap = {
  es: es,
  en: enUS
}

export function getDateLocale() {
  const lang = i18n.language?.substring(0, 2) || 'es'
  return localeMap[lang] || es
}

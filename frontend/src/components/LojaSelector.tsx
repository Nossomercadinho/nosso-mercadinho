import { useLoja } from '../contexts/LojaContext';
import Icon from './Icon';
export default function LojaSelector() {
  const { lojaAtiva, lojas, selecionarLoja, carregando } = useLoja();
  return <label className="active-store-picker"><Icon name="store" size={17} /><span><small>Loja ativa</small><select aria-label="Loja ativa" value={lojaAtiva?.id || ''} disabled={carregando || !lojas.length} onChange={event => selecionarLoja(Number(event.target.value))}>{!lojas.length && <option value="">Nenhum mercado liberado</option>}{lojas.map(loja => <option key={loja.id} value={loja.id}>{loja.nome}</option>)}</select></span></label>;
}

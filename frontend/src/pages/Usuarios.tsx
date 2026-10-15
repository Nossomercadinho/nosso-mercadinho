import { apiFetch } from '../services/apiClient';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Dialog from '../components/Dialog';
import Icon from '../components/Icon';
import ResponsiveFilters from '../components/ResponsiveFilters';
import './Usuarios.css';

type Papel = { id: number; nome: string; permissoes: string[]; sistema?: boolean; acessoTodasLojas?: boolean };
type Loja = { id: number; nome: string; codigo?: string; tipo?: string };
type Permissao = { codigo: string; nome: string };
type Usuario = { id: number; nome: string; email: string; perfil: string; papelId: number; papelNome: string; ativo: number | boolean; lojaIds: number[]; acessoTodasLojas?: boolean };
type Dados = { usuarios: Usuario[]; papeis: Papel[]; lojas: Loja[]; permissoesDisponiveis: Permissao[] };
type UsuarioForm = { id?: number; nome: string; email: string; senha: string; papelId: string; lojaIds: number[]; ativo: boolean };
type PapelForm = { id?: number; nome: string; permissoes: string[]; sistema?: boolean };
const novoUsuario = (): UsuarioForm => ({ nome: '', email: '', senha: '', papelId: '', lojaIds: [], ativo: true });

async function requisitar<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${localStorage.getItem('token') || ''}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await apiFetch(`/api/usuarios${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.sucesso === false) throw new Error(data.erro || data.mensagem || 'Não foi possível concluir a operação. Tente novamente.');
  return data as T;
}

export default function Usuarios() {
  const [dados, setDados] = useState<Dados>({ usuarios: [], papeis: [], lojas: [], permissoesDisponiveis: [] });
  const [aba, setAba] = useState<'usuarios' | 'papeis'>('usuarios');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('todos');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [usuarioForm, setUsuarioForm] = useState<UsuarioForm | null>(null);
  const [papelForm, setPapelForm] = useState<PapelForm | null>(null);
  const [erroForm, setErroForm] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function carregar(signal?: AbortSignal) {
    setCarregando(true);
    setErro('');
    try {
      const resultado = await requisitar<Dados>('', { signal });
      setDados(resultado);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setErro(error instanceof Error ? error.message : 'Falha ao carregar acessos.');
    } finally { if (!signal?.aborted) setCarregando(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void carregar(controller.signal);
    return () => controller.abort();
  }, []);

  const usuarios = useMemo(() => dados.usuarios.filter((usuario) => {
    const texto = `${usuario.nome} ${usuario.email} ${usuario.papelNome}`.toLocaleLowerCase('pt-BR');
    return texto.includes(busca.trim().toLocaleLowerCase('pt-BR')) && (status === 'todos' || Boolean(usuario.ativo) === (status === 'ativos'));
  }), [dados.usuarios, busca, status]);
  const papelSelecionado = dados.papeis.find((papel) => String(papel.id) === usuarioForm?.papelId);
  const filtrosAtivos = Number(Boolean(busca)) + Number(status !== 'todos');

  function editarUsuario(usuario?: Usuario) {
    setErroForm('');
    setUsuarioForm(usuario ? { id: usuario.id, nome: usuario.nome, email: usuario.email, senha: '', papelId: String(usuario.papelId), lojaIds: usuario.lojaIds || [], ativo: Boolean(usuario.ativo) } : novoUsuario());
  }

  function editarPapel(papel?: Papel) {
    setErroForm('');
    setPapelForm(papel ? { id: papel.id, nome: papel.nome, permissoes: [...papel.permissoes], sistema: papel.sistema } : { nome: '', permissoes: [] });
  }

  async function salvarUsuario(event: FormEvent) {
    event.preventDefault();
    if (!usuarioForm || salvando) return;
    if (!papelSelecionado) { setErroForm('Selecione o papel deste usuário.'); return; }
    if (!papelSelecionado.acessoTodasLojas && !usuarioForm.lojaIds.length) { setErroForm('Selecione pelo menos um mercado para este usuário.'); return; }
    setSalvando(true); setErroForm('');
    try {
      await requisitar(usuarioForm.id ? `/${usuarioForm.id}` : '', {
        method: usuarioForm.id ? 'PUT' : 'POST',
        body: JSON.stringify({ nome: usuarioForm.nome.trim(), email: usuarioForm.email.trim(), papelId: Number(usuarioForm.papelId), lojaIds: usuarioForm.lojaIds, ativo: usuarioForm.ativo, ...(usuarioForm.senha ? { senha: usuarioForm.senha } : {}) }),
      });
      setUsuarioForm(null); setAviso(usuarioForm.id ? 'Acessos do usuário atualizados.' : 'Usuário cadastrado. Ele já pode entrar com o e-mail e a senha definidos.');
      await carregar();
      window.dispatchEvent(new Event('nm:access-updated'));
    } catch (error) { setErroForm(error instanceof Error ? error.message : 'Falha ao salvar usuário.'); }
    finally { setSalvando(false); }
  }

  async function salvarPapel(event: FormEvent) {
    event.preventDefault();
    if (!papelForm || salvando) return;
    if (!papelForm.permissoes.length) { setErroForm('Selecione pelo menos uma permissão para este papel.'); return; }
    setSalvando(true); setErroForm('');
    try {
      await requisitar(papelForm.id ? `/papeis/${papelForm.id}` : '/papeis', { method: papelForm.id ? 'PUT' : 'POST', body: JSON.stringify({ nome: papelForm.nome.trim(), permissoes: papelForm.permissoes }) });
      setPapelForm(null); setAviso('Papel salvo. As permissões se aplicam a todos os usuários vinculados.');
      await carregar();
      window.dispatchEvent(new Event('nm:access-updated'));
    } catch (error) { setErroForm(error instanceof Error ? error.message : 'Falha ao salvar papel.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="access-page">
      <div className="page-header">
        <div><h1>Usuários e acessos</h1><p>Defina o que cada pessoa pode fazer e em quais mercados pode trabalhar.</p></div>
        <button className="primary-button" type="button" onClick={() => aba === 'usuarios' ? editarUsuario() : editarPapel()} disabled={carregando || Boolean(erro)}><Icon name="plus" size={17} />{aba === 'usuarios' ? 'Novo usuário' : 'Novo papel'}</button>
      </div>

      {aviso && <div className="access-feedback is-success" role="status"><Icon name="check" size={18} /><span>{aviso}</span><button type="button" aria-label="Dispensar aviso" onClick={() => setAviso('')}><Icon name="close" size={16} /></button></div>}
      {erro && <div className="access-feedback is-error" role="alert"><span>{erro}</span><button type="button" onClick={() => void carregar()}>Tentar novamente</button></div>}

      <div className="access-tabs" aria-label="Gestão de acessos">
        <button type="button" className={aba === 'usuarios' ? 'is-active' : ''} onClick={() => setAba('usuarios')} aria-pressed={aba === 'usuarios'}><Icon name="users" size={17} />Usuários<span>{dados.usuarios.length}</span></button>
        <button type="button" className={aba === 'papeis' ? 'is-active' : ''} onClick={() => setAba('papeis')} aria-pressed={aba === 'papeis'}><Icon name="shield" size={17} />Papéis<span>{dados.papeis.length}</span></button>
      </div>

      {aba === 'usuarios' ? <>
        <ResponsiveFilters label="Buscar e filtrar" activeCount={filtrosAtivos} onClear={() => { setBusca(''); setStatus('todos'); }}>
          <div className="access-filters"><label>Buscar usuário<input type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Nome, e-mail ou papel" /></label><label>Situação<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todos os usuários</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select></label></div>
        </ResponsiveFilters>
        <div className="access-list" aria-busy={carregando}>
          <div className="access-list-heading"><span>Pessoa / e-mail</span><span>Papel</span><span>Mercados permitidos</span><span>Situação</span><span /></div>
          {carregando ? <p className="access-empty" role="status">Carregando usuários…</p> : erro ? <p className="access-empty">Os acessos não puderam ser carregados.</p> : usuarios.length === 0 ? <div className="access-empty"><Icon name="users" size={25} /><strong>Nenhum usuário encontrado</strong><span>{filtrosAtivos ? 'Ajuste os filtros para ver outros usuários.' : 'Cadastre uma pessoa para definir seus acessos.'}</span></div> : usuarios.map((usuario) => <article className="access-user-row" key={usuario.id}>
            <div className="access-person"><span className="access-avatar" aria-hidden="true">{usuario.nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span><div><strong>{usuario.nome}</strong><span>{usuario.email}</span></div></div>
            <div className="access-role-name"><Icon name="shield" size={14} />{usuario.papelNome || usuario.perfil}</div>
            <div className="access-market-list">{usuario.acessoTodasLojas ? <span><Icon name="store" size={14} />Todos os mercados</span> : (usuario.lojaIds || []).length ? usuario.lojaIds.map((id) => <span key={id}>{dados.lojas.find((loja) => loja.id === id)?.nome || `Mercado ${id}`}</span>) : <span className="access-muted">Sem mercado vinculado</span>}</div>
            <span className={`access-status ${usuario.ativo ? 'is-active' : 'is-inactive'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span>
            <button type="button" className="access-edit" onClick={() => editarUsuario(usuario)} aria-label={`Editar acessos de ${usuario.nome}`}>Editar<Icon name="chevron" size={15} /></button>
          </article>)}
        </div>
        <p className="access-list-note">{!carregando && `${usuarios.length} ${usuarios.length === 1 ? 'usuário exibido' : 'usuários exibidos'} · ${dados.usuarios.filter((usuario) => usuario.ativo).length} ativos no total`}</p>
      </> : <div className="access-role-list" aria-busy={carregando}>
        {carregando ? <p className="access-empty">Carregando papéis…</p> : dados.papeis.map((papel) => <article key={papel.id} className="access-role-card"><div className="access-role-card-top"><span className="access-role-symbol"><Icon name="shield" size={21} /></span><div><h2>{papel.nome}</h2><span>{dados.usuarios.filter((usuario) => usuario.papelId === papel.id).length} usuários vinculados{papel.sistema && ' · Papel do sistema'}</span></div><button type="button" className="access-edit" onClick={() => editarPapel(papel)}>Ver permissões<Icon name="chevron" size={15} /></button></div><div className="access-permission-tags">{papel.permissoes.map((codigo) => <span key={codigo}>{dados.permissoesDisponiveis.find((permissao) => permissao.codigo === codigo)?.nome || codigo}</span>)}</div>{papel.acessoTodasLojas && <p><Icon name="store" size={14} />Acesso a todos os mercados.</p>}</article>)}
      </div>}

      <Dialog open={Boolean(usuarioForm)} title={usuarioForm?.id ? 'Editar usuário' : 'Novo usuário'} close={() => { if (!salvando) setUsuarioForm(null); }}>
        {usuarioForm && <form className="access-form" onSubmit={salvarUsuario}>
          <div className="access-form-grid"><label>Nome completo<input autoFocus required maxLength={120} value={usuarioForm.nome} onChange={(event) => setUsuarioForm({ ...usuarioForm, nome: event.target.value })} autoComplete="name" /></label><label>E-mail de acesso<input type="email" required maxLength={160} value={usuarioForm.email} onChange={(event) => setUsuarioForm({ ...usuarioForm, email: event.target.value })} autoComplete="off" /></label><label>{usuarioForm.id ? 'Nova senha (opcional)' : 'Senha inicial'}<input type="password" minLength={8} maxLength={128} required={!usuarioForm.id} value={usuarioForm.senha} onChange={(event) => setUsuarioForm({ ...usuarioForm, senha: event.target.value })} placeholder={usuarioForm.id ? 'Deixe em branco para manter' : 'Pelo menos 8 caracteres'} autoComplete="new-password" /></label><label>Papel<select required value={usuarioForm.papelId} onChange={(event) => setUsuarioForm({ ...usuarioForm, papelId: event.target.value })}><option value="">Selecione um papel</option>{dados.papeis.map((papel) => <option key={papel.id} value={papel.id}>{papel.nome}</option>)}</select></label></div>
          {papelSelecionado && <div className="access-role-preview"><Icon name="shield" size={16} /><span>{papelSelecionado.permissoes.length} permissões no papel {papelSelecionado.nome}. Confira ou edite na aba Papéis.</span></div>}
          <fieldset className="access-fieldset"><legend>Mercados permitidos</legend><p>A pessoa só poderá abrir o PDV nos mercados autorizados.</p>{papelSelecionado?.acessoTodasLojas ? <div className="access-all-markets"><Icon name="store" size={18} />Este papel tem acesso a todos os mercados, incluindo novas unidades.</div> : <div className="access-check-grid">{dados.lojas.map((loja) => <label key={loja.id} className="access-choice"><input type="checkbox" checked={usuarioForm.lojaIds.includes(loja.id)} onChange={(event) => setUsuarioForm({ ...usuarioForm, lojaIds: event.target.checked ? [...usuarioForm.lojaIds, loja.id] : usuarioForm.lojaIds.filter((id) => id !== loja.id) })} /><span><strong>{loja.nome}</strong>{loja.tipo && <small>{loja.tipo === 'MATRIZ' ? 'Matriz' : 'Filial'}{loja.codigo ? ` · ${loja.codigo}` : ''}</small>}</span></label>)}{dados.lojas.length === 0 && <span className="access-muted">Cadastre um mercado em Unidades antes de vincular este usuário.</span>}</div>}</fieldset>
          {usuarioForm.id && <label className="access-choice access-active-toggle"><input type="checkbox" checked={usuarioForm.ativo} onChange={(event) => setUsuarioForm({ ...usuarioForm, ativo: event.target.checked })} /><span><strong>Usuário ativo</strong><small>Desativar impede novos acessos ao sistema.</small></span></label>}
          {erroForm && <p className="access-form-error" role="alert">{erroForm}</p>}
          <div className="access-form-actions"><button className="secondary-button" type="button" disabled={salvando} onClick={() => setUsuarioForm(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar usuário'}</button></div>
        </form>}
      </Dialog>

      <Dialog open={Boolean(papelForm)} title={papelForm?.id ? 'Permissões do papel' : 'Novo papel'} close={() => { if (!salvando) setPapelForm(null); }}>
        {papelForm && <form className="access-form" onSubmit={salvarPapel}>
          <label>Nome do papel<input autoFocus required maxLength={80} value={papelForm.nome} onChange={(event) => setPapelForm({ ...papelForm, nome: event.target.value })} disabled={papelForm.sistema} placeholder="Ex.: Operador de caixa" /></label>
          <fieldset className="access-fieldset"><legend>Acesso aos módulos</legend><p>{papelForm.sistema ? 'Papel protegido do sistema. Suas permissões são fixas.' : 'Selecione as áreas que os usuários deste papel podem acessar.'}</p><div className="access-check-grid">{dados.permissoesDisponiveis.map((permissao) => <label className="access-choice" key={permissao.codigo}><input type="checkbox" disabled={papelForm.sistema} checked={papelForm.permissoes.includes(permissao.codigo)} onChange={(event) => setPapelForm({ ...papelForm, permissoes: event.target.checked ? [...papelForm.permissoes, permissao.codigo] : papelForm.permissoes.filter((codigo) => codigo !== permissao.codigo) })} /><span>{permissao.nome}</span></label>)}</div></fieldset>
          {papelForm.id && !papelForm.sistema && <p className="access-role-preview"><Icon name="users" size={16} /><span>Alterações valem para todos os usuários vinculados a este papel.</span></p>}
          {erroForm && <p className="access-form-error" role="alert">{erroForm}</p>}
          <div className="access-form-actions"><button className="secondary-button" type="button" disabled={salvando} onClick={() => setPapelForm(null)}>{papelForm.sistema ? 'Fechar' : 'Cancelar'}</button>{!papelForm.sistema && <button className="primary-button" type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar papel'}</button>}</div>
        </form>}
      </Dialog>
    </div>
  );
}

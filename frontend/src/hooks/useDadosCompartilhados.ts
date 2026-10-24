import {useEffect,useRef} from 'react';

/** Refresh visible lists across sessions without overwriting editing forms. */
export function useDadosCompartilhados(atualizar:()=>void|Promise<unknown>){
  const callback=useRef(atualizar);callback.current=atualizar;
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined,ocupado=false;
    const recarregar=()=>{if(document.visibilityState!=='visible'||ocupado)return;ocupado=true;Promise.resolve().then(()=>callback.current()).catch(()=>{}).finally(()=>{ocupado=false;});};
    const agendar=()=>{if(timer)clearTimeout(timer);timer=setTimeout(recarregar,400);};
    const visivel=()=>{if(document.visibilityState==='visible')agendar();};
    window.addEventListener('nm:dados-atualizados',agendar);window.addEventListener('focus',agendar);document.addEventListener('visibilitychange',visivel);
    const intervalo=setInterval(recarregar,30000);
    return()=>{if(timer)clearTimeout(timer);clearInterval(intervalo);window.removeEventListener('nm:dados-atualizados',agendar);window.removeEventListener('focus',agendar);document.removeEventListener('visibilitychange',visivel);};
  },[]);
}

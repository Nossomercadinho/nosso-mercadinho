export {calcularCustoReal,compararCusto,decimal,ratear} from '../generated/custo-real';
export type {ConferenciaCusto,ItemCusto,Tributo} from '../generated/custo-real';
import type {ConferenciaCusto,ItemCusto,Tributo} from '../generated/custo-real';
export const impostoVazio=():Tributo=>({valor:'0',cobrado:false,incluido:false});
export function itemCustoVazio():ItemCusto{return {id:crypto.randomUUID(),descricao:'',ean:'',codigoFornecedor:'',unidade:'',quantidadeCompra:'1',unidadesEmbalagem:null,valorProdutos:'0',desconto:'0',frete:'0',seguro:'0',despesas:'0',ipi:impostoVazio(),icmsSt:impostoVazio(),fcpSt:impostoVazio(),icmsProprio:'0',revisado:false};}
export function conferenciaVazia(origem:ConferenciaCusto['origem']='MANUAL'):ConferenciaCusto{return {origem,fornecedorNome:'',itens:[itemCustoVazio()],totais:{frete:null,seguro:null,despesas:null,desconto:null,outros:'0'},totalNota:null,avisos:[]};}
export const reais=(v:unknown)=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export type PaginaTextoPdf={largura:number;altura:number;itens:{texto:string;x:number;y:number;largura:number;altura:number}[]};
export type DocumentoLocal={nome:string;mime:string;base64:string};

export async function lerArquivosNota(files:File[],progresso:(s:string)=>void,rotacao=0):Promise<{xml?:string;texto?:string;origem:'XML'|'PDF'|'FOTO';documentos:DocumentoLocal[];paginasPdf?:PaginaTextoPdf[]}>{
  if(!files.length||files.length>12)throw new Error('Selecione de 1 a 12 documentos.');
  const xml=files.find(f=>/\.xml$/i.test(f.name));
  const documentos:DocumentoLocal[]=[];
  let bytesTotal=0;
  const adicionar=async(blob:Blob,nome:string,mime:string)=>{
    bytesTotal+=blob.size;if(bytesTotal>2621440)throw new Error('Os documentos devem somar até 2,5 MB. Reduza as fotos ou divida o PDF antes de anexar.');
    const base64=await new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=()=>no(new Error('Falha ao ler arquivo.'));r.readAsDataURL(blob);});
    documentos.push({nome,mime,base64});
  };
  // XML has precedence. Never OCR a PDF when the authorized structured file is supplied.
  if(xml){if(xml.size>2621440)throw new Error('XML acima de 2,5 MB.');await adicionar(xml,xml.name,'application/xml');return {xml:await xml.text(),origem:'XML',documentos};}
  let worker:Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>|undefined;
  const reconhecer=async(canvas:HTMLCanvasElement)=>{
    if(!worker){const {createWorker,OEM}=await import('tesseract.js');worker=await createWorker('por',OEM.LSTM_ONLY,{workerPath:'/ocr/worker.min.js',corePath:'/ocr',langPath:'/ocr',logger:m=>{if(m.status==='recognizing text')progresso(`Lendo texto: ${Math.round(m.progress*100)}%`);}});}
    const result=await worker.recognize(canvas,{rotateAuto:true});return result.data.text;
  };
  const textos:string[]=[],paginasPdf:PaginaTextoPdf[]=[];let pdfPresente=false;
  try{
    for(const [index,file] of files.entries()){
      progresso(`Documento ${index+1} de ${files.length}`);
      if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
        pdfPresente=true;await adicionar(file,file.name,'application/pdf');
        const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/ocr/pdf.worker.min.mjs';
        const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/ocr/cmaps/',cMapPacked:true,standardFontDataUrl:'/ocr/standard_fonts/',wasmUrl:'/ocr/wasm/'});
        const pdf=await task.promise;
        try{
          if(pdf.numPages>20)throw new Error('PDF limitado a 20 páginas por conferência.');
          for(let p=1;p<=pdf.numPages;p++){
            progresso(`PDF: página ${p} de ${pdf.numPages}`);const page=await pdf.getPage(p);const text=await page.getTextContent();
            const baseViewport=page.getViewport({scale:1});
            const itensPosicionados=text.items.filter((i):i is typeof i & {str:string;transform:number[];width:number;height:number}=>'str' in i).filter(i=>i.str.trim()).map(i=>{const t=pdfjs.Util.transform(baseViewport.transform,i.transform);return {texto:i.str,x:t[4],y:t[5],largura:i.width,altura:i.height};});
            if(itensPosicionados.length)paginasPdf.push({largura:baseViewport.width,altura:baseViewport.height,itens:itensPosicionados});
            const linhas=new Map<number,{x:number;texto:string}[]>();
            for(const item of text.items){if(!('str' in item))continue;const y=Math.round(item.transform[5]/2)*2;const linha=linhas.get(y)||[];linha.push({x:item.transform[4],texto:item.str});linhas.set(y,linha);}
            let lido=[...linhas].sort((a,b)=>b[0]-a[0]).map(([,v])=>v.sort((a,b)=>a.x-b.x).map(i=>i.texto).join(' ')).join('\n');
            if(lido.trim().length<30){const original=page.getViewport({scale:1});const scale=Math.min(3,2600/Math.max(original.width,original.height));const viewport=page.getViewport({scale,rotation:(page.rotate+rotacao)%360});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvas,viewport}).promise;lido=await reconhecer(canvas);canvas.width=1;canvas.height=1;}
            textos.push(lido);page.cleanup();
          }
        }finally{await task.destroy();}
      }else{
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('Use imagens JPG, PNG ou WebP de até 12 MB, PDF ou XML.');
        const image=await createImageBitmap(file);const factor=Math.min(1,2200/Math.max(image.width,image.height));
        const w=Math.round(image.width*factor),h=Math.round(image.height*factor),canvas=document.createElement('canvas');const sideways=rotacao%180!==0;
        canvas.width=sideways?h:w;canvas.height=sideways?w:h;const ctx=canvas.getContext('2d');if(!ctx){image.close();throw new Error('Não foi possível abrir a foto.');}
        ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotacao*Math.PI/180);ctx.drawImage(image,-w/2,-h/2,w,h);image.close();
        const blob=await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error('Não foi possível preparar a foto.')),'image/jpeg',0.85));
        await adicionar(blob,file.name.replace(/\.[^.]+$/,'')+'.jpg','image/jpeg');textos.push(await reconhecer(canvas));canvas.width=1;canvas.height=1;
      }
    }
    return {texto:textos.join('\n\n'),origem:pdfPresente?'PDF':'FOTO',documentos,...(paginasPdf.length?{paginasPdf}:{} )};
  }finally{await worker?.terminate();}
}

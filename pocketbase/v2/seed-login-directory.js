import process from "node:process";

class PB {
  constructor(baseUrl){this.baseUrl=String(baseUrl||"").replace(/\/$/,"");this.token=""}
  async request(path,options={}){
    const headers={Accept:"application/json",Authorization:this.token,...(options.headers||{})};
    if(options.body!==undefined)headers["Content-Type"]="application/json";
    const r=await fetch(this.baseUrl+path,{...options,headers});
    const b=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(`${options.method||"GET"} ${path}: ${r.status} ${b.message||""}`);
    return b;
  }
  async login(){
    const identity=process.env.POCKETBASE_SUPERUSER_EMAIL;
    const password=process.env.POCKETBASE_SUPERUSER_PASSWORD;
    if(!identity||!password)throw new Error("Credenziali superuser PocketBase mancanti.");
    const a=await this.request("/api/collections/_superusers/auth-with-password",{method:"POST",body:JSON.stringify({identity,password})});
    this.token=a.token;
  }
  async listAll(collection,fields=""){
    const out=[];
    for(let page=1;;page++){
      const p=new URLSearchParams({page:String(page),perPage:"500"});
      if(fields)p.set("fields",fields);
      const result=await this.request(`/api/collections/${collection}/records?${p}`);
      out.push(...(result.items||[]));
      if(page>=Number(result.totalPages||1))break;
    }
    return out;
  }
  async find(collection,field,value){
    const filter=encodeURIComponent(`${field} = "${String(value).replaceAll('"','\\"')}"`);
    const page=await this.request(`/api/collections/${collection}/records?perPage=1&filter=${filter}`);
    return page.items?.[0]||null;
  }
  async create(collection,payload){return this.request(`/api/collections/${collection}/records`,{method:"POST",body:JSON.stringify(payload)})}
  async update(collection,id,payload){return this.request(`/api/collections/${collection}/records/${id}`,{method:"PATCH",body:JSON.stringify(payload)})}
}

const pb=new PB(process.env.POCKETBASE_URL||"http://127.0.0.1:8090");
await pb.login();
const agents=await pb.listAll("agenti","legacy_id,nome_completo,residenza,attivo");
let creates=0,updates=0,unchanged=0;
for(const agent of agents){
  if(!String(agent.legacy_id||"").trim()||!String(agent.nome_completo||"").trim())continue;
  const payload={
    login_id:String(agent.legacy_id),
    nome_visualizzato:String(agent.nome_completo),
    residenza:String(agent.residenza||""),
    attivo:agent.attivo!==false,
  };
  const existing=await pb.find("login_directory","login_id",payload.login_id);
  if(!existing){await pb.create("login_directory",payload);creates++;continue}
  const same=String(existing.nome_visualizzato||"")===payload.nome_visualizzato&&String(existing.residenza||"")===payload.residenza&&Boolean(existing.attivo)===Boolean(payload.attivo);
  if(same){unchanged++;continue}
  await pb.update("login_directory",existing.id,payload);updates++;
}
console.log(JSON.stringify({agents:agents.length,creates,updates,unchanged},null,2));

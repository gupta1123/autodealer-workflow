type Company={id:string;name:string};
export function defaultCaseCompany(companies:Company[],preferredId='',now=new Date()):string {
  if(companies.some(c=>c.id===preferredId))return preferredId;
  if(companies.length===1)return companies[0].id;
  // Different financial years of the same business are safe to default to
  // today's Indian FY. Never guess between unrelated businesses.
  const parsed=companies.map(c=>({id:c.id,match:c.name.match(/^(.*?)\s*(?:[-–—·|]\s*)?\(?\s*(?:FY\s*)?((?:20)?\d{2})\s*[-–—]\s*(?:20)?(\d{2})\)?\s*$/i)}));
  if(!parsed.length||parsed.some(c=>!c.match))return '';
  if(new Set(parsed.map(c=>c.match![1].trim().toLowerCase())).size!==1)return '';
  const india=new Date(now.getTime()+330*60_000);
  const year=india.getUTCFullYear()-(india.getUTCMonth()<3?1:0);
  const current=parsed.filter(c=>(c.match![2].length===2?2000:0)+Number(c.match![2])===year&&Number(c.match![3])===(year+1)%100);
  return current.length===1?current[0].id:'';
}

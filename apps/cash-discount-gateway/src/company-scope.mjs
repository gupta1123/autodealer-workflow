export function scopedCompanyCheck(data,authority){
  if(!authority)return data;
  const permitted=authority.datasets||[{company_name:authority.companyName,company_guid:authority.companyGuid,financial_year:authority.financialYear}];
  const companies=(Array.isArray(data?.companies)?data.companies:[]).flatMap(company=>{
    const rawGuid=String(company.companyGuid||company.guid||'').trim();
    const matches=permitted.filter(link=>link.company_name===company.companyName
      &&(!rawGuid||link.company_guid===rawGuid)
      &&(!company.financialYear||link.financial_year===company.financialYear));
    if(matches.length!==1)return [];
    const link=matches[0];return [{companyName:link.company_name,companyGuid:link.company_guid,financialYear:link.financial_year,isActive:company.isActive===true,...(link.company_id?{accessCompanyId:link.company_id}:{})}];
  });
  const allowed=name=>companies.some(company=>company.companyName===name)?name:'';
  return {activeCompany:allowed(data?.activeCompany),selectedCompany:allowed(data?.selectedCompany),companies};
}

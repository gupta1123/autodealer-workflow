import test from 'node:test';import assert from 'node:assert/strict';
import {scopedCompanyCheck} from './company-scope.mjs';
test('company bootstrap exposes only reviewed permitted datasets and no raw status',()=>{
 const data={activeCompany:'Other',selectedCompany:'Allowed',secret:'private',companies:[{companyName:'Other'},{companyName:'Allowed',financialYear:'2026-27',extra:'private'}]};
 const result=scopedCompanyCheck(data,{datasets:[{company_name:'Allowed',company_guid:'guid',financial_year:'2026-27'}]});
 assert.deepEqual(result,{activeCompany:'',selectedCompany:'Allowed',companies:[{companyName:'Allowed',companyGuid:'guid',financialYear:'2026-27',isActive:false}]});
 assert.equal(scopedCompanyCheck(data,null),data);
});
test('ambiguous same-name company years are not guessed',()=>{
 const result=scopedCompanyCheck({companies:[{companyName:'Same'}]},{datasets:[{company_name:'Same',financial_year:'2025-26'},{company_name:'Same',financial_year:'2026-27'}]});assert.deepEqual(result.companies,[]);
});
test('client action scope uses only the reviewed company identity',()=>{
 const result=scopedCompanyCheck({companies:[{companyName:'Allowed',accessCompanyId:'spoofed'}]},
  {datasets:[{company_name:'Allowed',company_guid:'guid',financial_year:'2026-27',company_id:'reviewed-company'}]});
 assert.equal(result.companies[0].accessCompanyId,'reviewed-company');
});
test('a connector company guid must match the reviewed mapping',()=>{
 const authority={datasets:[{company_name:'Allowed',company_guid:'reviewed-guid',financial_year:'2026-27',company_id:'reviewed-company'}]};
 assert.deepEqual(scopedCompanyCheck({companies:[{companyName:'Allowed',guid:'different-guid',financialYear:'2026-27'}]},authority).companies,[]);
 assert.equal(scopedCompanyCheck({companies:[{companyName:'Allowed',guid:'reviewed-guid',financialYear:'2026-27'}]},authority).companies[0].accessCompanyId,'reviewed-company');
});

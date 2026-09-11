// Read-only verification of the two existing local test-company notes.
import {resolveDebitNoteVoucher} from '../apps/tally-bridge/src/bridge.mjs';
for (const [id,referenceNumber,partyLedgerName,amount] of [
  ['12290','DN-CD-INV/26-27/02429-TFINAL','Dakshin Kulkarni Construction Enterprises, Nagpur',3987.46],
  ['12291','DN-CD-INV/26-27/03847-TFINAL','Dakshin Taparia Projects Associates, Pune',24373.26],
]) {
  const start=Date.now();
  const voucher=await resolveDebitNoteVoucher('http://localhost:9000',{
    companyName:'Solution Nyx',tallyVoucherId:id,referenceNumber,partyLedgerName,
    salesLedgerName:'Solution Sales Account',amount,
  });
  console.log(JSON.stringify({id:voucher.masterId,ms:Date.now()-start,verified:true}));
}

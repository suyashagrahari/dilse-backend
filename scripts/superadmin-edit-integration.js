/**
 * Integration checks for super-admin template editing.
 *
 * DROPS THE DATABASE it points at — aim it only at a scratch one. Setup is the
 * same as scripts/superadmin-integration.js.
 *
 * The invariants worth having: only scalars are editable, `userId`/`shareId`/
 * `password`/`viewCount` are refused outright, a mixed request applies the
 * valid fields and reports the rest rather than failing whole, and every
 * applied edit lands in the audit log with its before/after.
 */

require("dotenv").config({path:"./.env.satest"});
const mongoose=require("mongoose"); const jwt=require("jsonwebtoken");
const API="http://127.0.0.1:5099/api";
let pass=0,fail=0;
const ck=(n,c,e="")=>{c?(pass++,console.log("  ✓ "+n)):(fail++,console.log("  ✗ "+n+" "+e));};
(async()=>{
  await mongoose.connect(process.env.LOCAL_MONGODB_URI);
  await mongoose.connection.db.dropDatabase();
  const User=require("./dist/models/User").default;
  const P=require("./dist/models/BirthdayGfPage").default;
  const sa=await User.create({email:"suyashagrahari2121@gmail.com",name:"S",provider:"local",password:"x1234567"});
  const u=await User.create({email:"u@t.com",name:"U",provider:"local",password:"x1234567"});
  const pg=await P.create({userId:u._id,shareId:"edit-1",isPublished:true,password:"opensesame",
    recipientName:"Aarav",senderName:"Priya",personalMessage:"Origanal message",viewCount:12,
    galleryPhotos:[{url:"https://x/a.jpg",caption:"c"}]});
  const T=jwt.sign({userId:String(sa._id),email:sa.email,tv:0},process.env.JWT_SECRET,{expiresIn:"1h"});
  const api=async(p,o={})=>{const r=await fetch(API+p,{...o,headers:{"Content-Type":"application/json",Authorization:`Bearer ${T}`}});return{s:r.status,b:await r.json().catch(()=>({}))};};
  const PATCH=(body)=>api(`/admin/super/pages/birthday-gf/${pg._id}`,{method:"PATCH",body:JSON.stringify(body)});

  console.log("\n── editing scalars ──");
  let r=await PATCH({updates:{recipientName:"Aarav Kumar",personalMessage:"Corrected message"}});
  ck("edit accepted",r.s===200,JSON.stringify(r.b));
  let fresh=await P.findById(pg._id);
  ck("recipientName updated",fresh.recipientName==="Aarav Kumar",fresh.recipientName);
  ck("personalMessage updated",fresh.personalMessage==="Corrected message");

  console.log("\n── protected fields are refused ──");
  for(const [k,v] of [["userId",String(sa._id)],["shareId","hijacked"],["password","newpw"],["viewCount",99999]]){
    const rr=await PATCH({updates:{[k]:v}});
    ck(`refuses ${k}`, rr.s===400, `status ${rr.s}`);
  }
  fresh=await P.findById(pg._id).select("+passwordRaw");
  ck("userId unchanged",String(fresh.userId)===String(u._id));
  ck("shareId unchanged",fresh.shareId==="edit-1");
  ck("viewCount unchanged",fresh.viewCount===12,String(fresh.viewCount));
  ck("password still the original hash",await fresh.comparePassword("opensesame"));

  console.log("\n── non-scalars and unknown fields refused ──");
  ck("refuses array field",(await PATCH({updates:{galleryPhotos:[]}})).s===400);
  ck("refuses unknown field",(await PATCH({updates:{notAField:"x"}})).s===400);
  fresh=await P.findById(pg._id);
  ck("gallery intact",fresh.galleryPhotos.length===1);

  console.log("\n── partial: good fields apply, bad ones reported ──");
  r=await PATCH({updates:{senderName:"Priya S",shareId:"nope"}});
  ck("mixed request succeeds for the valid field",r.s===200&&r.b.data.applied.includes("senderName"),JSON.stringify(r.b.data||r.b));
  ck("invalid field listed as rejected",r.b.data?.rejected?.includes("shareId"));
  fresh=await P.findById(pg._id);
  ck("senderName updated",fresh.senderName==="Priya S");
  ck("shareId STILL unchanged",fresh.shareId==="edit-1");

  console.log("\n── audit ──");
  const al=await api(`/admin/super/audit?limit=50`);
  const edits=(al.b.data?.entries||[]).filter(x=>x.action==="page.edit_content");
  // Two requests actually applied changes; the refused ones correctly write
  // no audit entry, because nothing happened to record.
  ck("one audit entry per applied edit, none for refused ones",edits.length===2,`got ${edits.length}`);
  const named=edits.find(x=>x.changes?.recipientName);
  ck("audit records before/after for the name edit",
     named?.changes?.recipientName?.from==="Aarav" && named?.changes?.recipientName?.to==="Aarav Kumar",
     JSON.stringify(edits.map(x=>x.changes)));
  ck("audit has no plaintext password",!JSON.stringify(al.b).includes("opensesame"));

  await mongoose.disconnect();
  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error("ERR",e.message);process.exit(1)});

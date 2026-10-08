import { describe, expect, it } from "vitest";
import { evalFormulaForTierDetailed, type FieldDef } from "./index";
import { applyColumnTierSync } from "../tier-link/sync";
const value = (n:number) => [{op:"+" as const,unit:"number" as const,value:n}];
describe("incomparable referenced field cannot turn false into unknown",()=>{
 for(const match of ["first","all"] as const)for(const op of ["gte","lte"] as const)for(const side of ["left","right"] as const){
  it(`${match}/${op}/${side} missing other value`,()=>{
   const fields:FieldDef[]=[{key:"date",label:"date",type:"date"},{key:"bound",label:"bound",type:"text"},{key:"fee",label:"fee",type:"formula",formula:value(300000),conditional:{match,rules:[{leftKey:side==="left"?"bound":"date",op,right:{kind:"field",key:side==="left"?"date":"bound"},formula:value(200000)}]}}];
   expect(evalFormulaForTierDetailed(fields[2],{id:"one",label:"one",date:"",bound:"하이브"},fields)).toMatchObject({value:300000});
  });
 }
});

const child = (kind: "missing" | "conflict"): FieldDef => ({key:"child",label:"child",type:"formula",formula:value(100000),conditional:{match:"all",rules:kind==="missing"?[{leftKey:"date",op:"gte",right:{kind:"text",value:"2026-08-01"},formula:value(200000)}]:[100000,200000].map(n=>({leftKey:"flag",right:{kind:"text",value:"yes"},formula:value(n)}))}});
const inputs: FieldDef[]=[{key:"date",label:"date",type:"date"},{key:"bound",label:"bound",type:"text"},{key:"flag",label:"flag",type:"text"}];
describe("confirmed incomparable values versus actual blocked dependencies",()=>{
 for(const match of [undefined,"first","all"] as const) for(const kind of ["missing","conflict"] as const) for(const op of ["gte","lte"] as const) for(const reverse of [false,true]){
  it(`${match}/${kind}/${op}/${reverse} unrelated blocked operand does not leak`,()=>{
   const fee:FieldDef={key:"fee",label:"fee",type:"formula",formula:value(300000),conditional:{match,rules:[{leftKey:reverse?"bound":"child",op,right:{kind:"field",key:reverse?"child":"bound"},formula:value(200000)}]}};
   const fields=[...inputs,child(kind),fee]; const tier={id:"a",label:"a",date:"",bound:"하이브",flag:"yes"};
   const result=evalFormulaForTierDetailed(fee,tier,fields);expect(result.value).toBe(300000);expect(result.blocked).toBeUndefined();
  });
 }
 for(const match of [undefined,"first","all"] as const) for(const kind of ["missing","conflict"] as const){
  it(`${match}/${kind} saved raw string cannot bypass its own blocked calculation`,()=>{
   const fee:FieldDef={key:"fee",label:"fee",type:"formula",formula:value(300000),conditional:{match,rules:[{leftKey:"child",op:"gte",right:{kind:"text",value:"0"},formula:value(200000)}]}};
   const result=evalFormulaForTierDetailed(fee,{id:"a",label:"a",date:"",flag:"yes",child:"하이브"},[...inputs,child(kind),fee]);expect(result).toMatchObject({value:null,blocked:{kind}});
  });
 }
 it.each([0,"1,000","2026-08-01"])("valid comparable %s remains comparable",bound=>{
  const fee:FieldDef={key:"fee",label:"fee",type:"formula",formula:value(300000),conditional:{match:"all",rules:[{leftKey:"bound",op:"gte",right:{kind:"text",value:String(bound)},formula:value(200000)}]}};
  expect(evalFormulaForTierDetailed(fee,{id:"a",label:"a",bound},[...inputs,fee]).value).toBe(200000);
 });
 it("all ordinary blank plus valid date remains missing",()=>{
  const fee:FieldDef={key:"fee",label:"fee",type:"formula",formula:value(300000),conditional:{match:"all",rules:[{leftKey:"date",op:"gte",right:{kind:"field",key:"bound"},formula:value(200000)}]}};
  expect(evalFormulaForTierDetailed(fee,{id:"a",label:"a",date:"",bound:"2026-08-01"},[...inputs,fee])).toMatchObject({value:null,blocked:{kind:"missing"}});
 });
 it("save sync preserves 300000 for false and null for true blocked",()=>{
  const fee:FieldDef={key:"fee",label:"fee",type:"formula",formula:value(300000),conditional:{match:"all",rules:[{leftKey:"date",op:"gte",right:{kind:"field",key:"bound"},formula:value(200000)}]}};
  const link={columnKey:"flat",section:"tax-amendment",area:"contract" as const,tierFieldKey:"fee",mode:"sum" as const};
  const data={계약정보_차수:[{id:"a",label:"a",date:"",bound:"하이브"}]};
  const evalContext=[...inputs,fee];
  expect(applyColumnTierSync(data,"계약정보_차수",data.계약정보_차수,[link],"tax-amendment",evalContext)).toMatchObject({synced:{flat:300000}});
  const missing=[{id:"a",label:"a",date:"",bound:"2026-08-01"}];
  expect(applyColumnTierSync({계약정보_차수:missing},"계약정보_차수",missing,[link],"tax-amendment",evalContext)).toMatchObject({synced:{flat:null}});
 });
});

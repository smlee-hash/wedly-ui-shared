import * as React from "react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopTable } from "./DesktopTable";
vi.mock("@tanstack/react-virtual",()=>({useVirtualizer:()=>({getVirtualItems:()=>[],getTotalSize:()=>0})}));
vi.stubGlobal("React", React);
const fn=()=>{};
const props:any={mobileViewMode:"table",pagedData:[],sortedDataLength:0,activeColumns:[{key:"name",label:"상호명",type:"text"}],colWidths:{name:2000},stickyOffsets:{},checkedIds:new Set(),toggleAllChecks:fn,sortConfig:null,handleSort:fn,colMenuKey:null,setColMenuKey:fn,colMenuRef:{current:null},renamingColKey:null,setRenamingColKey:fn,renameValue:"",setRenameValue:fn,saveColLabel:fn,removeColFromTab:fn,dragColKey:null,setDragColKey:fn,dragOverColKey:null,setDragOverColKey:fn,resizingRef:{current:null},reorderColumn:fn,onResizeStart:fn,onResizeDoubleClick:fn,getColLabel:(c:any)=>c.label,getColAccent:()=>null,error:null,searchQuery:"",refreshData:fn,renderRow:()=>null};
describe("wide table readable state",()=>{
 it.each([null,"불러오기 실패"])("state stays outside wide scrolling surface %s",error=>{
  const html=renderToStaticMarkup(createElement(DesktopTable,{...props,error}));
  const table=html.slice(html.indexOf("<table"),html.indexOf("</table>")+8);
  expect(table).toContain("상호명");
  expect(table).not.toContain(error||"데이터가 없습니다");
  expect(html.slice(html.indexOf("</table>")+8)).toContain(error||"데이터가 없습니다");
  if(error) expect(html).toContain("다시 시도");
 });
 it("populated mode has no empty notice",()=>{
  const html=renderToStaticMarkup(createElement(DesktopTable,{...props,sortedDataLength:1,pagedData:[{_id:"1",name:"example"}]}));
  expect(html).toContain("<table");expect(html).not.toContain("데이터가 없습니다");
 });
});

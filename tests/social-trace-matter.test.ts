import {describe,expect,it} from 'vitest';
import {World} from '../src/sim/core/world';
import type {Situation,WorldEvent} from '../src/sim/core/types';
import {socialTraceMatterKeys} from '../src/headless/social/trace';
const matter=(id:string,root:string,kind:Situation['kind']='harm',itemId?:string):Situation=>({id,kind,rootEventId:root,rootType:kind==='loss'?'item_missing':'attack',eventIds:[root],subjectId:'subject',actorId:kind==='loss'?undefined:'actor',itemId,openedAt:10,lastEventAt:10,status:'active',severity:0.5});
const event=(id:string,item?:string)=>({id,item} as WorldEvent);
describe('social trace canonical matter selection',()=>{
 it('keeps the triggering beating and its response, excluding later incidents involving the same subject',()=>{
  const w=new World(1),trigger=matter('trigger','first-blow');trigger.eventIds.push('second-blow','arrest-response');
  w.situations.push(trigger,matter('later','unrelated-confrontation'));
  expect(socialTraceMatterKeys(w,'subject',event('first-blow'),'family_harm',10)).toEqual(['ev:first-blow','ev:second-blow','ev:arrest-response']);
 });
 it('includes the stolen item discovery while excluding other property losses and earlier discoveries',()=>{
  const w=new World(1),theft=matter('theft','taking','property','ring'),old=matter('old','old-loss','loss','ring');old.openedAt=9;
  w.situations.push(theft,matter('matching','noticed','loss','ring'),matter('other','other-loss','loss','purse'),old);
  expect(socialTraceMatterKeys(w,'subject',event('taking','ring'),'theft',10)).toEqual(['ev:taking','ev:noticed','missing:ring']);
 });
});

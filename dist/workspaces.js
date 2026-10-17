import {History} from './core.js';

// 两个方案只保存快照和各自的历史；当前可见状态仍由 Three 对象持有。
export class LayoutSchemes {
  constructor() {
    this.id='a';
    this.slots={a:{state:null,history:new History()},b:{state:null,history:new History()}};
  }
  get history() { return this.slots[this.id].history; }
  switchTo(id,current) {
    if(!Object.hasOwn(this.slots,id))throw new Error('未知布局方案。');
    if(id===this.id)return null;
    const source=this.slots[this.id],target=this.slots[id];
    source.state=structuredClone(current);
    source.history.push(current);
    if(!target.state){target.state=structuredClone(current);target.history.push(target.state);}
    this.id=id;
    return structuredClone(target.state);
  }
}

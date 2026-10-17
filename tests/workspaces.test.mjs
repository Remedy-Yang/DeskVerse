import test from 'node:test';
import assert from 'node:assert/strict';
import {LayoutSchemes} from '../dist/workspaces.js';

const scene=()=>({selectedId:'monitor',drawerOpenings:{left:0},doorOpening:1,items:[{id:'monitor',position:[0,0,0],scale:[1,1,1],sizeVariants:[{name:'原规格',dimensions:[54,41,16]}],sizeChartUrl:'blob:chart-a'}]});

test('Schemes copy once and retain independent transforms, assets and metadata',()=>{
  const layouts=new LayoutSchemes(),a=scene();layouts.history.push(a);
  const b=layouts.switchTo('b',a);
  b.items[0].position[0]=30;b.items[0].scale[1]=2;b.items[0].sizeVariants[0].name='B规格';b.items[0].sizeVariants[0].dimensions[0]=70;b.items[0].sizeChartUrl='blob:chart-b';b.items.push({id:'mouse',position:[2,0,3]});b.drawerOpenings.left=1;b.doorOpening=0;
  const restoredA=layouts.switchTo('a',b);
  assert.deepEqual(restoredA,a);
  restoredA.items=[];
  assert.deepEqual(layouts.switchTo('b',restoredA),b);
  assert.deepEqual(layouts.switchTo('a',b).items,[]);
});

test('Undo and redo histories remain isolated across scheme switches',()=>{
  const layouts=new LayoutSchemes(),initial=scene();layouts.history.push(initial);
  const b=layouts.switchTo('b',initial);b.items[0].position[0]=20;layouts.history.push(b);
  const a=layouts.switchTo('a',b);a.items[0].position[0]=-10;layouts.history.push(a);
  assert.deepEqual(layouts.history.undo(),initial);
  layouts.switchTo('b',initial);
  assert.equal(layouts.history.undo().items[0].position[0],0);
  assert.equal(layouts.history.redo().items[0].position[0],20);
  layouts.switchTo('a',b);
  assert.equal(layouts.history.redo().items[0].position[0],-10);
});

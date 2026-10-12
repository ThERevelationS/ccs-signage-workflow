import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

// Actual React component with an in-memory map SDK. No browser, provider requests,
// Base44 calls, user credentials, or production writes.
const require=createRequire(import.meta.url);
const source=await fs.readFile('src/components/permitting/GoogleMapView.jsx','utf8');
const compiled=(await transform(source,{loader:'jsx',format:'cjs',jsx:'automatic',target:'es2022'})).code;
function harness(){
 let sessionToken='session-a',renderer;
 const mapsCreated=[],lines=[],listeners=[];
 class Map {
  constructor(){mapsCreated.push(this);this.data={forEach(){},remove(){},addGeoJson(){},setStyle(){}};}
  panTo(){} setZoom(){}
  addListener(name,callback){const listener={callback,removed:false,remove(){this.removed=true;}};listeners.push(listener);return listener;}
 }
 class Polyline {
  constructor(){this.path=[];this.path.clear=()=>this.path.splice(0);lines.push(this);}
  getPath(){return this.path;} setMap(){}
 }
 class Layer {setMap(){}}
 const maps={Map,Polyline,TrafficLayer:Layer,TransitLayer:Layer,BicyclingLayer:Layer,
  Marker:class {setMap(){} setPosition(){} setTitle(){}},
  geometry:{spherical:{computeLength:path=>path.length*10}},event:{clearInstanceListeners(){},trigger(){}}};
 const window={google:{maps}};
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,window,console,require:name=>{
  if(name==='@/components/auth/EmailGate')return {useAuth:()=>({sessionToken})};
  if(name==='./googleMapsLoader')return {loadGoogleMaps:async()=>maps};
  return require(name);
 }});
 const Component=module.exports.default,props={position:{lat:39.34,lng:-84.32},markerTitle:'Synthetic address',boundaries:[]};
 const button=name=>renderer.root.findAllByType('button').find(node=>node.children.includes(name));
 const text=()=>JSON.stringify(renderer.toJSON());
 async function mount(){await act(async()=>{renderer=TestRenderer.create(React.createElement(Component,props),{createNodeMock:()=>({})});});}
 async function measure(){await act(async()=>button('Measure distance').props.onClick());await act(async()=>listeners.at(-1).callback({latLng:{lat:39.34,lng:-84.32}}));assert.equal(button('Measure distance').props['aria-pressed'],true);assert.match(text(),/32.8 ft/);}
 async function updateAddress(){await act(async()=>renderer.update(React.createElement(Component,{...props,position:{lat:39.4,lng:-84.4}})));}
 async function refreshSession(){sessionToken='session-b';await act(async()=>renderer.update(React.createElement(Component,props)));}
 async function retry(){await act(async()=>window.gm_authFailure());await act(async()=>button('Try map again').props.onClick());}
 async function close(){await act(async()=>renderer?.unmount());}
 return {mount,measure,updateAddress,refreshSession,retry,close,button,text,mapsCreated,lines,listeners};
}
for(const recovery of ['session refresh','map retry'])test(`${recovery} clears measurements from the disposed map`,async()=>{
 const h=harness();try{
  await h.mount();await h.measure();
  await (recovery==='session refresh'?h.refreshSession():h.retry());
  assert.equal(h.mapsCreated.length,2);
  assert.equal(h.listeners[0].removed,true);
  assert.equal(h.button('Measure distance').props['aria-pressed'],false);
  assert.doesNotMatch(h.text(),/32.8 ft/);
  assert.equal(h.lines.at(-1).path.length,0);
  await act(async()=>h.listeners.at(-1).callback({latLng:{lat:39.34,lng:-84.32}}));
  assert.equal(h.lines.at(-1).path.length,0,'recovery requires explicitly starting a new measurement');
  await h.measure();
 }finally{await h.close();}
});
test('ordinary address changes preserve an active measurement on the same map',async()=>{
 const h=harness();try{await h.mount();await h.measure();await h.updateAddress();assert.equal(h.mapsCreated.length,1);assert.equal(h.button('Measure distance').props['aria-pressed'],true);}finally{await h.close();}
});

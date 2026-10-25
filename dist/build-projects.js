import { lessons } from './lessons.js';

const indicator={led:{a:'bb:e9',b:'bb:e10'},resistor:{a:'bb:c6',b:'bb:c9',ohms:330}};
const labels={led:'LED',resistor:'330 Ω resistor',button:'Push button',potentiometer:'Potentiometer'};
export const BUILD_PROJECTS=[
  {id:'blink',title:'Build a blinking LED',shortTitle:'Blink',
    goal:'Build a complete path from GPIO23 through the resistor and LED to GND.',
    parts:['led','resistor'],labels,placements:structuredClone(indicator),
    control:{type:'interval',label:'Blink interval',min:100,max:1500,step:50,value:500},
    code:lessons.find(l=>l.id==='blink').code},
  {id:'button',title:'Build a button-controlled LED',shortTitle:'Button + LED',
    goal:'Connect a button from GPIO18 to GND, then build the LED output on GPIO23.',
    parts:['led','resistor','button'],labels,
    placements:{...structuredClone(indicator),button:{a:'bb:d16',b:'bb:d18',c:'bb:f16',d:'bb:f18'}},
    control:{type:'button',label:'Hold button',value:false},
    code:lessons.find(l=>l.id==='button').code},
  {id:'potentiometer',title:'Build a brightness control',shortTitle:'Dial + LED',
    goal:'Power the potentiometer from 3V3 and GND. Connect its wiper to GPIO34 and the LED output to GPIO23.',
    parts:['led','resistor','potentiometer'],labels,
    placements:{...structuredClone(indicator),potentiometer:{a:'bb:h18',w:'bb:h19',b:'bb:h20'}},
    control:{type:'range',label:'Dial position',min:0,max:100,step:1,value:50},
    code:lessons.find(l=>l.id==='potentiometer').code},
];
export function getBuildProject(id){return BUILD_PROJECTS.find(p=>p.id===id)||BUILD_PROJECTS[0];}
export function buildSketch(state){
  const project=getBuildProject(state?.project);
  return project.id==='blink'?project.code.replace(/(const int INTERVAL_MS = )\d+(;)/,`$1${state?.interval??500}$2`):project.code;
}

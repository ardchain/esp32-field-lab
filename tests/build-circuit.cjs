const assert=require('node:assert/strict');

(async()=>{
  const M=await import('../dist/build-circuit.js');
  const P=await import('../dist/build-projects.js');
  let passed=0;
  function test(name,fn){fn();passed++;console.log('PASS '+name);}
  const wire=(id,from,to,color='#d4ac58')=>({id,from,to,color});
  const clone=value=>structuredClone(value);
  const setup=(led={a:'bb:e9',b:'bb:e10'},resistor={a:'bb:c6',b:'bb:c9',ohms:330})=>
    ({...M.initialState(),parts:{led,resistor}});
  const valid=()=>({...setup(),wires:[wire('signal','pin:23','bb:a6'),wire('ground','bb:a10','pin:GND')]});
  const projectSetup=id=>({...M.initialState(id),parts:clone(P.getBuildProject(id).placements)});
  const validProject=id=>{
    const s=projectSetup(id);s.wires=valid().wires;
    if(id==='button')s.wires.push(wire('input','pin:18','bb:a16'),wire('return','bb:j16','pin:GND2'));
    if(id==='potentiometer')s.wires.push(wire('low','pin:GND2','bb:f18'),wire('wiper','pin:34','bb:f19'),wire('high','pin:3V3','bb:f20'));
    return s;
  };
  const verdict=(state,code)=>{const result=M.validateCircuit(state);assert.equal(result.code,code,JSON.stringify(result));assert.equal(result.ok,code==='complete');return result;};

  test('all 430 physical contacts are unique and parsable',()=>{
    const ids=M.allEndpoints();assert.equal(ids.length,430);assert.equal(new Set(ids).size,430);
    assert.equal(ids.filter(id=>id.startsWith('bb:')).length,300);
    assert.equal(ids.filter(id=>id.startsWith('rail:')).length,100);
    for(const id of ids)assert.equal(M.parseEndpoint(id).id,id);
  });
  test('board aliases keep physical grounds distinct but electrically common',()=>{
    assert.equal(M.canonicalEndpoint('pin:GPIO23'),'pin:23');
    assert.equal(M.canonicalEndpoint('pin:VP'),'pin:36');
    assert.equal(M.canonicalEndpoint('pin:RX2'),'pin:16');
    assert.equal(M.canonicalEndpoint('pin:GND-L'),'pin:GND2');
    assert.equal(M.canonicalEndpoint('pin:GND-R'),'pin:GND');
    assert.equal(M.netOf('pin:GND2'),M.netOf('pin:GND'));
    assert.notEqual(M.canonicalEndpoint('pin:GND2'),M.canonicalEndpoint('pin:GND'));
  });
  test('breadboard strips, center gap and independent continuous rails',()=>{
    for(let row=1;row<=30;row++){
      assert.equal(M.netOf(`bb:a${row}`),M.netOf(`bb:e${row}`));
      assert.equal(M.netOf(`bb:f${row}`),M.netOf(`bb:j${row}`));
      assert.notEqual(M.netOf(`bb:e${row}`),M.netOf(`bb:f${row}`));
      if(row<30)assert.notEqual(M.netOf(`bb:a${row}`),M.netOf(`bb:a${row+1}`));
    }
    for(const rail of ['L+','L-','R+','R-'])assert.equal(M.netOf(`rail:${rail}:1`),M.netOf(`rail:${rail}:25`));
    assert.equal(new Set(['L+','L-','R+','R-'].map(r=>M.netOf(`rail:${r}:1`))).size,4);
  });
  test('malformed endpoints never become valid electrical nodes',()=>{
    for(const id of ['bb:a0','bb:a31','bb:k1','bb:a01','rail:L+:0','rail:R-:26','pin:0','pin:100','pin:<script>',null,{},'__proto__'])
      assert.equal(M.parseEndpoint(id),null,String(id));
  });
  test('finite footprints, rotations and LED polarity',()=>{
    assert.deepEqual(M.placement('led','bb:e9'),{a:'bb:e9',b:'bb:e10'});
    assert.deepEqual(M.placement('led','bb:e9',0,true),{a:'bb:e10',b:'bb:e9'});
    assert.deepEqual(M.placement('resistor','bb:c6'),{a:'bb:c6',b:'bb:c9',ohms:330});
    assert.deepEqual(M.placement('resistor','bb:a5',90),{a:'bb:a5',b:'bb:d5',ohms:330});
    assert.deepEqual(M.placement('led','bb:e9',180),{a:'bb:e9',b:'bb:e8'});
    for(const args of [['led','bb:a30'],['resistor','bb:a29'],['led','bb:j1',90],['led','pin:23'],['led','bb:a1',45]])
      assert.equal(M.placement(...args),null);
  });
  test('empty build asks for components',()=>verdict(M.initialState(),'missing_parts'));
  test('minimal series circuit uses the strip between separate holes',()=>{
    const result=verdict(valid(),'complete');assert.equal(result.period,1000);assert.equal(result.resistance,330);
  });
  test('all 26 shifted row layouts work in either breadboard half',()=>{
    for(const col of [['c','e','a'],['h','j','f']])for(let row=1;row<=26;row++){
      const s=setup({a:`bb:${col[1]}${row+3}`,b:`bb:${col[1]}${row+4}`},{a:`bb:${col[0]}${row}`,b:`bb:${col[0]}${row+3}`,ohms:330});
      s.wires=[wire('a','pin:23',`bb:${col[2]}${row}`),wire('b',`bb:${col[2]}${row+4}`,'pin:GND')];
      verdict(s,'complete');
    }
  });
  test('resistor after the LED is equally valid',()=>{
    const s=setup({a:'bb:e8',b:'bb:e9'});s.wires=[wire('a','pin:23','bb:a8'),wire('b','bb:a6','pin:GND2')];
    verdict(s,'complete');
  });
  test('wire direction, color and harmless redundant jumpers do not determine success',()=>{
    const s=valid();s.wires=s.wires.map(w=>({...w,from:w.to,to:w.from,color:'#abcdef'}));
    s.wires.push(wire('extra','bb:b20','bb:d20'));verdict(s,'complete');
  });
  test('power rails conduct along their full length',()=>{
    const s=setup();s.wires=[wire('1','pin:23','rail:L+:1'),wire('2','rail:L+:25','bb:a6'),
      wire('3','bb:a10','rail:R-:5'),wire('4','rail:R-:23','pin:GND2')];verdict(s,'complete');
  });
  test('opposite power rails are not secretly connected',()=>{
    const s=setup();s.wires=[wire('1','pin:23','rail:L+:1'),wire('2','rail:R+:25','bb:a6'),wire('3','bb:a10','pin:GND')];
    verdict(s,'missing_gpio');
  });
  test('center gap separates a visually aligned pair of holes',()=>{
    const s=setup({a:'bb:j9',b:'bb:j10'});s.wires=[wire('1','pin:23','bb:a6'),wire('2','bb:f10','pin:GND')];
    verdict(s,'open_path');s.wires.push(wire('bridge','bb:d9','bb:g9'));verdict(s,'complete');
  });
  test('one lead per actual hole, while adjacent holes are available',()=>{
    const s=setup();assert.equal(M.wireIssue(s,'pin:23','bb:c6').code,'occupied_contact');
    assert.equal(M.wireIssue(s,'pin:23','bb:a6'),null);
    assert.equal(M.placementIssue(s,'led',{a:'bb:c6',b:'bb:c7'}).code,'occupied_contact');
    assert.equal(M.placementIssue(s,'led',{a:'bb:e9',b:'bb:e10'}),null);
    s.wires=[wire('1','pin:23','bb:a6')];assert.equal(M.wireIssue(s,'pin:23','bb:b9').code,'occupied_contact');
    assert.equal(M.wireIssue(s,'pin:GND','pin:GND2'),null);
  });
  test('self loops, duplicate reverse wires and invalid endpoints are rejected',()=>{
    const s=valid();assert.equal(M.wireIssue(s,'bb:a1','bb:a1').code,'same_endpoint');
    assert.equal(M.wireIssue(s,'bb:a6','pin:23').code,'duplicate_wire');
    assert.equal(M.wireIssue(s,'bb:z1','pin:23').code,'invalid_endpoint');
  });
  test('reversed LED is diagnosed without running',()=>{
    const s=valid();[s.parts.led.a,s.parts.led.b]=[s.parts.led.b,s.parts.led.a];verdict(s,'reversed_led');assert.equal(M.ledIsOn(s,0),false);
  });
  test('two LED legs in a shared strip short the LED',()=>{
    const s=setup({a:'bb:d9',b:'bb:e9'});verdict(s,'led_shorted');
  });
  test('same-strip resistor and wire bypass both defeat current limiting',()=>{
    const s=setup(null,{a:'bb:a6',b:'bb:d6',ohms:330});s.parts.led={a:'bb:e9',b:'bb:e10'};verdict(s,'resistor_bypassed');
    const v=valid();v.wires.push(wire('bypass','bb:b6','bb:b9'));verdict(v,'resistor_bypassed');
  });
  test('LED cannot be driven directly while resistor sits elsewhere',()=>{
    const s=valid();s.wires[0].to='bb:a9';verdict(s,'missing_current_limit');
  });
  test('missing source and return path have different feedback',()=>{
    const a=valid();a.wires.splice(0,1);verdict(a,'missing_gpio');
    const b=valid();b.wires.splice(1,1);verdict(b,'missing_ground');
  });
  test('wrong GPIO and constant power are not accepted as Blink',()=>{
    const a=valid();a.wires[0].from='pin:22';verdict(a,'wrong_gpio');
    for(const pin of ['pin:3V3','pin:VIN']){const b=valid();b.wires[0].from=pin;verdict(b,'constant_power');}
    const c=valid();c.wires[0].from='pin:EN';verdict(c,'reset_pin');
  });
  test('direct shorts are detected even before components are placed',()=>{
    for(const [a,b,code] of [['pin:23','pin:GND','short_gpio'],['pin:3V3','pin:GND2','short_power'],
      ['pin:VIN','pin:GND','short_power'],['pin:23','pin:3V3','short_supplies'],['pin:VIN','pin:3V3','short_supplies']]){
      const s=M.initialState();s.wires=[wire('short',a,b)];verdict(s,code);
    }
  });
  test('an extra supply on a valid circuit cannot bypass the off state',()=>{
    const s=valid();s.wires.push(wire('power','pin:3V3','bb:b9'));verdict(s,'missing_current_limit');
    const r=setup({a:'bb:e8',b:'bb:e9'});r.wires=[wire('a','pin:23','bb:a8'),wire('b','bb:a6','pin:GND'),wire('power','pin:3V3','bb:b9')];
    verdict(r,'extra_supply');
  });
  test('unused wires can still overvoltage an input or hold the board in reset',()=>{
    for(const pin of ['pin:34','pin:1','pin:EN']){
      const s=valid();s.wires.push(wire('danger','pin:VIN',pin));verdict(s,'gpio_overvoltage');
    }
    const s=valid();s.wires.push(wire('reset','pin:EN','pin:GND2'));verdict(s,'held_in_reset');
  });
  test('the fixed Blink task excludes additional GPIO branches on its active path',()=>{
    for(const pin of ['pin:1','pin:34']){
      const s=valid();s.wires.push(wire('extra',pin,'bb:b9'));const result=verdict(s,'extra_gpio');
      assert.match(result.message,/other GPIO states are not modeled/);
    }
    const isolated=valid();isolated.wires.push(wire('extra','pin:34','bb:a20'));verdict(isolated,'complete');
  });
  test('GPIO12 high at reset is excluded for the modeled original WROOM board',()=>{
    const s=valid();s.wires.push(wire('strap','pin:3V3','pin:12'));verdict(s,'boot_strap');
  });
  test('supported resistances are limited to safe teaching values',()=>{
    for(const r of M.RESISTANCES){const s=valid();s.parts.resistor.ohms=r;verdict(s,'complete');}
    const s=valid();s.parts.resistor.ohms=0;verdict(s,'invalid_placement');
  });
  test('malformed raw state is rejected rather than silently repaired',()=>{
    verdict(null,'invalid_state');verdict({...valid(),version:2},'invalid_state');
    verdict({...valid(),interval:0},'invalid_interval');verdict({...valid(),interval:Infinity},'invalid_interval');
    verdict({...valid(),interval:125},'invalid_interval');
    const s=valid();s.wires.push(wire('bad','pin:42','bb:a1'));verdict(s,'invalid_endpoint');
    const duplicate=valid();duplicate.wires[1].id=duplicate.wires[0].id;verdict(duplicate,'invalid_wire_id');
  });
  test('storage restoration bounds inputs and strips dangerous properties',()=>{
    assert.deepEqual(M.normalizeState(null),M.initialState());assert.deepEqual(M.normalizeState({version:999}),M.initialState());
    const s=valid();s.extra='<script>';s.interval=Infinity;s.wires[0].color='url(javascript:bad)';s.wires[0].id='<img>';
    s.parts.led.extra='bad';s.wires.push(wire('bad','pin:900','bb:a8'));
    const restored=M.normalizeState(s);assert.equal(restored.interval,500);assert.equal(restored.extra,undefined);
    assert.equal(restored.parts.led.extra,undefined);assert.equal(restored.wires.length,2);assert.equal(restored.wires[0].color,M.WIRE_COLORS[0]);
    verdict(restored,'complete');
    s.interval=1600;assert.equal(M.normalizeState(s).interval,1500);s.interval=-100;assert.equal(M.normalizeState(s).interval,100);
  });
  test('restoring colliding identifiers terminates and produces unique IDs',()=>{
    const s=M.initialState();s.wires=[wire('same','bb:a1','bb:a2'),wire('wire-3-1','bb:b3','bb:b4'),wire('same','bb:c5','bb:c6')];
    const restored=M.normalizeState(s);assert.equal(new Set(restored.wires.map(w=>w.id)).size,3);
  });
  test('restoring overlapping contacts keeps only physically possible objects',()=>{
    const s=valid();s.wires.push(wire('collision','pin:23','bb:a3'));assert.equal(M.normalizeState(s).wires.length,2);
    s.parts.resistor={a:'bb:e9',b:'bb:e12',ohms:330};assert.equal(M.normalizeState(s).parts.resistor,null);
  });
  test('wire cap is enforced before accepting oversized external state',()=>{
    const s=M.initialState();s.wires=Array.from({length:60},(_,i)=>wire('w'+i,`bb:a${i%30+1}`,`bb:b${i%30+1}`));
    assert.equal(M.wireIssue(s,'pin:23','pin:GND').code,'wire_limit');
    s.wires.push(wire('over','pin:23','pin:GND'));verdict(s,'invalid_state');
    assert.ok(M.normalizeState(s).wires.length<=60);
  });
  test('validation and normalization never mutate their input',()=>{
    const s=valid(),before=JSON.stringify(s);M.validateCircuit(s);M.normalizeState(s);assert.equal(JSON.stringify(s),before);
    const a=M.initialState(),b=M.initialState();a.wires.push(wire('x','pin:23','bb:a1'));assert.equal(b.wires.length,0);
  });
  test('LED animation follows validated interval and never validates an invalid build',()=>{
    const s=valid();for(const t of [0,1,499,1000])assert.equal(M.ledIsOn(s,t),true);
    for(const t of [500,999,1500,-1,Infinity])assert.equal(M.ledIsOn(s,t),false);
    s.interval=250;assert.equal(M.ledIsOn(s,249),true);assert.equal(M.ledIsOn(s,250),false);
    s.wires=[];assert.equal(M.ledIsOn(s,0),false);
  });
  test('three projects expose distinct parts, sketches and controls',()=>{
    assert.deepEqual(P.BUILD_PROJECTS.map(p=>p.id),['blink','button','potentiometer']);
    for(const project of P.BUILD_PROJECTS){
      assert.deepEqual(Object.keys(M.initialState(project.id).parts),project.parts);
      for(const kind of project.parts)assert.equal(M.placementIssue(M.initialState(project.id),kind,project.placements[kind]),null);
      assert.equal(typeof project.code,'string');assert.ok(project.code.length>100);
    }
    assert.match(P.buildSketch({...valid(),interval:250}),/INTERVAL_MS = 250;/);
    assert.match(P.getBuildProject('button').code,/INPUT_PULLUP/);
    assert.match(P.getBuildProject('potentiometer').code,/analogRead/);
    assert.equal(P.getBuildProject('unknown').id,'blink');
  });
  test('legacy Blink drafts remain valid and new project drafts restore independently',()=>{
    const old=valid();delete old.project;verdict(old,'complete');assert.equal(M.normalizeState(old).project,'blink');
    for(const id of ['button','potentiometer']){
      const s=validProject(id);assert.deepEqual(M.normalizeState(s),s);verdict(s,'complete');
      const missing=M.initialState(id);verdict(missing,'missing_parts');
    }
    verdict({...valid(),project:'made-up'},'invalid_project');
    assert.equal(M.normalizeState({...valid(),project:'made-up'}).project,'blink');
    const extra=valid();extra.parts.button=P.getBuildProject('button').placements.button;verdict(extra,'unexpected_part');
  });
  test('button and potentiometer footprints rotate, stay finite and expose semantic terminals',()=>{
    const button=M.placement('button','bb:d16');
    assert.deepEqual(button,{a:'bb:d16',b:'bb:d18',c:'bb:f16',d:'bb:f18'});
    assert.deepEqual(M.partTerminals('button',button),['bb:d16','bb:d18','bb:f16','bb:f18']);
    assert.deepEqual(M.placement('button','bb:d16',90),{a:'bb:d16',b:'bb:f16',c:'bb:d14',d:'bb:f14'});
    assert.deepEqual(M.placement('potentiometer','bb:h18'),{a:'bb:h18',w:'bb:h19',b:'bb:h20'});
    assert.deepEqual(M.partTerminals('potentiometer',M.placement('potentiometer','bb:h18')),['bb:h18','bb:h19','bb:h20']);
    for(const args of [['button','bb:i1'],['button','bb:a29'],['potentiometer','bb:h29'],['potentiometer','bb:i1',90]])assert.equal(M.placement(...args),null);
    const s=M.initialState('potentiometer');assert.equal(M.placementIssue(s,'potentiometer',{a:'bb:h18',w:'bb:h20',b:'bb:h21'}).code,'invalid_placement');
    assert.equal(M.placementIssue(M.initialState('button'),'button',{...button,d:'bb:g18'}).code,'invalid_placement');
  });
  test('all component legs reserve physical holes and restore rejects collisions',()=>{
    const s=projectSetup('button');
    for(const endpoint of M.partTerminals('button',s.parts.button))assert.equal(M.wireIssue(s,'pin:18',endpoint).code,'occupied_contact');
    assert.equal(M.placementIssue(s,'led',{a:'bb:f18',b:'bb:f19'}).code,'occupied_contact');
    const pot=projectSetup('potentiometer');assert.equal(M.wireIssue(pot,'pin:34','bb:h19').code,'occupied_contact');
    pot.parts.potentiometer={a:'bb:e8',w:'bb:e9',b:'bb:e10'};assert.equal(M.normalizeState(pot).parts.potentiometer,null);
  });
  test('button uses permanent same-side pairs and either pair can be the input',()=>{
    const s=validProject('button');verdict(s,'complete');
    s.wires.find(w=>w.id==='input').to='bb:a18';s.wires.find(w=>w.id==='return').from='bb:j18';verdict(s,'complete');
    s.wires.find(w=>w.id==='input').to='bb:j18';s.wires.find(w=>w.id==='return').from='bb:a18';verdict(s,'complete');
  });
  test('button supports shifted and rotated layouts without memorized positions',()=>{
    for(let row=12;row<=28;row++){
      const s=validProject('button');s.parts.button=M.placement('button',`bb:e${row}`);
      s.wires.find(w=>w.id==='input').to=`bb:a${row}`;s.wires.find(w=>w.id==='return').from=`bb:j${row+2}`;verdict(s,'complete');
    }
    const s=validProject('button');s.parts.button=M.placement('button','bb:d16',90);
    s.wires.find(w=>w.id==='input').to='bb:a16';s.wires.find(w=>w.id==='return').from='bb:j14';verdict(s,'complete');
  });
  test('released button cannot have its sides bridged by strips or a jumper',()=>{
    const s=validProject('button');s.wires.push(wire('bridge','bb:b18','bb:i18'));verdict(s,'button_shorted');
    const same=validProject('button');same.parts.button=M.placement('button','bb:a16');same.wires.find(w=>w.id==='input').to='bb:b16';verdict(same,'button_shorted');
    const wrongPair=validProject('button');wrongPair.wires.find(w=>w.id==='return').from='bb:b18';verdict(wrongPair,'input_grounded');
  });
  test('button requires both GPIO18 and ground, including input and output isolation',()=>{
    const s=validProject('button');s.wires=s.wires.filter(w=>w.id!=='return');verdict(s,'button_input');
    const wrong=validProject('button');wrong.wires.find(w=>w.id==='input').from='pin:19';verdict(wrong,'button_input');
    const joined=validProject('button');joined.wires.push(wire('join','bb:b16','bb:b9'));verdict(joined,'input_output_join');
    const branch=validProject('button');branch.wires.push(wire('branch','pin:1','bb:b18'));verdict(branch,'extra_input_gpio');
  });
  test('button rejects a supply on either switch side before a press can short it',()=>{
    for(const pin of ['pin:3V3','pin:VIN']){
      const s=validProject('button');s.wires=s.wires.filter(w=>w.id!=='input');s.wires.push(wire('danger',pin,'bb:a16'));verdict(s,'button_power');
    }
    const output=validProject('button');output.wires=output.wires.filter(w=>w.id!=='input');output.wires.push(wire('danger','bb:b6','bb:a16'));verdict(output,'button_power');
    const powerOnGround=validProject('button');powerOnGround.wires.push(wire('danger','pin:3V3','bb:i18'));verdict(powerOnGround,'short_power');
  });
  test('button simulation reflects the internal pull-up and stops on invalid builds',()=>{
    const s=validProject('button'),released=M.simulationState(s,{pressed:false}),pressed=M.simulationState(s,{pressed:true});
    assert.equal(released.valid,true);assert.equal(released.inputLevel,'HIGH');assert.equal(released.ledBrightness,0);
    assert.equal(pressed.inputLevel,'LOW');assert.equal(pressed.ledBrightness,1);
    s.wires.pop();assert.equal(M.simulationState(s,{pressed:true}).valid,false);assert.equal(M.simulationState(s,{pressed:true}).ledBrightness,0);
  });
  test('potentiometer outer terminals may be swapped and the dial direction follows',()=>{
    const s=validProject('potentiometer');assert.equal(verdict(s,'complete').potReversed,false);
    for(const [value,adc,duty] of [[0,0,0],[50,2048,127],[100,4095,255]]){
      const sim=M.simulationState(s,{value});assert.equal(sim.adc,adc);assert.equal(sim.duty,duty);assert.equal(sim.ledBrightness,duty/255);
    }
    [s.wires[2].to,s.wires[4].to]=[s.wires[4].to,s.wires[2].to];assert.equal(verdict(s,'complete').potReversed,true);
    assert.equal(M.simulationState(s,{value:0}).adc,4095);assert.equal(M.simulationState(s,{value:100}).adc,0);
    assert.equal(M.simulationState(s,{value:-50}).adc,4095);assert.equal(M.simulationState(s,{value:Infinity}).value,50);
  });
  test('potentiometer can move to either breadboard half and use either orientation',()=>{
    for(const [part,holes] of [
      [{a:'bb:c21',w:'bb:c22',b:'bb:c23'},['bb:a21','bb:a22','bb:a23']],
      [{a:'bb:j27',w:'bb:j26',b:'bb:j25'},['bb:f27','bb:f26','bb:f25']],
    ]){
      const s=validProject('potentiometer');s.parts.potentiometer=part;
      for(let i=0;i<3;i++)s.wires[i+2].to=holes[i];verdict(s,'complete');
    }
  });
  test('potentiometer works with separate continuous power rails and arbitrary wire colors',()=>{
    const s=validProject('potentiometer');s.wires=s.wires.slice(0,2);
    s.wires.push(wire('gnd','pin:GND2','rail:L-:1'),wire('low','rail:L-:25','bb:f18'),
      wire('vcc','pin:3V3','rail:R+:25'),wire('high','rail:R+:1','bb:f20'),wire('w','pin:34','bb:f19'));
    s.wires=s.wires.map(w=>({...w,color:'#abcdef'}));verdict(s,'complete');
  });
  test('potentiometer rejects same-strip legs, outer shorts and a shorted wiper',()=>{
    const horizontal=validProject('potentiometer');horizontal.parts.potentiometer=M.placement('potentiometer','bb:g23',90);verdict(horizontal,'pot_shorted');
    const outers=validProject('potentiometer');outers.wires=outers.wires.filter(w=>w.id!=='high');outers.wires.push(wire('same','bb:g18','bb:g20'));verdict(outers,'pot_shorted');
    for(const outer of ['bb:g18','bb:g20']){const s=validProject('potentiometer');s.wires.push(wire('short','bb:g19',outer));verdict(s,'pot_shorted');}
    const isolatedWiper=validProject('potentiometer');isolatedWiper.wires.find(w=>w.id==='wiper').to='bb:a24';
    isolatedWiper.wires.push(wire('tie','bb:b24','bb:g20'));verdict(isolatedWiper,'wiper_shorted');
  });
  test('potentiometer requires GPIO34 on the wiper and both outer power connections',()=>{
    const unpowered=validProject('potentiometer');unpowered.wires=unpowered.wires.filter(w=>w.id!=='high');verdict(unpowered,'pot_power');
    const wrong=validProject('potentiometer');wrong.wires.find(w=>w.id==='wiper').from='pin:35';verdict(wrong,'wiper_input');
    const joined=validProject('potentiometer');joined.wires.push(wire('join','bb:g19','bb:b9'));verdict(joined,'input_output_join');
    const extra=validProject('potentiometer');extra.wires.push(wire('extra','pin:35','bb:g19'));verdict(extra,'extra_input_gpio');
    const vin=validProject('potentiometer');vin.wires.find(w=>w.id==='high').from='pin:VIN';verdict(vin,'pot_voltage');
  });
  test('new project simulations never mutate source state and never run disconnected inputs',()=>{
    for(const id of ['button','potentiometer']){
      const s=validProject(id),before=JSON.stringify(s);M.simulationState(s,{pressed:true,value:71});assert.equal(JSON.stringify(s),before);
      s.wires=[];const sim=M.simulationState(s,{pressed:true,value:100});assert.equal(sim.valid,false);assert.equal(sim.ledBrightness,0);
    }
  });
  test('connection plans solve all three project nets using free contacts without moving parts',()=>{
    for(const id of ['blink','button','potentiometer']){
      const s=projectSetup(id),before=JSON.stringify(s),plan=M.connectionPlan(s);assert.ok(Array.isArray(plan));assert.ok(plan.length>0);assert.equal(JSON.stringify(s),before);
      for(const [i,edge] of plan.entries()){
        assert.equal(M.wireIssue(s,edge.from,edge.to),null);s.wires.push(wire('planned-'+i,edge.from,edge.to));
      }
      verdict(s,'complete');assert.deepEqual(M.connectionPlan(s),[]);
    }
  });
  test('connection plans handle partial alternative wiring and refuse existing faults',()=>{
    const s=validProject('potentiometer');[s.wires[2].to,s.wires[4].to]=[s.wires[4].to,s.wires[2].to];s.wires.splice(3,1);
    const plan=M.connectionPlan(s);assert.equal(plan.length,1);s.wires.push(wire('hint',plan[0].from,plan[0].to));verdict(s,'complete');
    const button=validProject('button');button.wires.push(wire('bridge','bb:b18','bb:i18'));assert.equal(M.connectionPlan(button),null);
    assert.equal(M.connectionPlan(M.initialState('button')),null);
    const reversed=valid();[reversed.parts.led.a,reversed.parts.led.b]=[reversed.parts.led.b,reversed.parts.led.a];assert.equal(M.connectionPlan(reversed),null);
  });
  const screenshotBuild=()=>({...setup({a:'bb:e6',b:'bb:e7'},{a:'bb:c8',b:'bb:c11',ohms:330}),
    wires:[wire('signal','pin:23','bb:d8'),wire('ground','pin:GND','rail:L+:16')]});
  test('wire resolution keeps free contacts unchanged and canonicalizes aliases',()=>{
    const s=M.initialState();assert.deepEqual(M.resolveWireEndpoint(s,'pin:GPIO23'),{ok:true,requested:'pin:23',endpoint:'pin:23',redirected:false});
    assert.deepEqual(M.resolveWireConnection(s,'pin:GPIO23','bb:e6'),{ok:true,from:'pin:23',to:'bb:e6',redirected:[]});
    assert.equal(M.resolveWireEndpoint(s,'bb:k1').code,'invalid_endpoint');
    assert.equal(M.resolveWireConnection(s,'bb:a1','pin:999').code,'invalid_endpoint');
    assert.equal(M.resolveWireEndpoint(null,'bb:a1').code,'invalid_state');
  });
  test('occupied component clicks resolve to the nearest free hole in their own strip',()=>{
    const s=screenshotBuild();assert.equal(M.resolveWireEndpoint(s,'bb:e6').endpoint,'bb:d6');
    const link=M.resolveWireConnection(s,'bb:e6','bb:c11');
    assert.deepEqual(link,{ok:true,from:'bb:d6',to:'bb:b11',redirected:[{requested:'bb:e6',endpoint:'bb:d6'},{requested:'bb:c11',endpoint:'bb:b11'}]});
    assert.equal(M.wireIssue(s,link.from,link.to),null);
    assert.equal(M.wireIssue(s,'bb:e6','bb:c11').code,'occupied_contact');
    const raw=clone(s);raw.wires.push(wire('collision','bb:e6','bb:c11'));verdict(raw,'occupied_contact');
    assert.equal(M.normalizeState(raw).wires.length,s.wires.length);
  });
  test('occupied GPIO clicks find jumper holes while ground prefers its other board header',()=>{
    const s=screenshotBuild();assert.equal(M.resolveWireEndpoint(s,'pin:23').endpoint,'bb:e8');
    assert.equal(M.resolveWireEndpoint(s,'pin:GND').endpoint,'pin:GND2');
    const link=M.resolveWireConnection(s,'pin:GND','bb:e7');assert.equal(link.from,'pin:GND2');assert.equal(link.to,'bb:d7');
    assert.equal(M.wireIssue(s,link.from,link.to),null);
    // A free hole in the originally clicked strip takes priority over remote holes.
    s.wires.push(wire('branch','bb:a6','bb:a24'));assert.equal(M.resolveWireEndpoint(s,'bb:e6').endpoint,'bb:d6');
  });
  test('already connected contacts are reported before occupancy or spare-hole resolution',()=>{
    const s=screenshotBuild();
    for(const [from,to] of [['pin:GND','rail:L+:25'],['pin:GND2','rail:L+:16'],['pin:23','bb:c8'],['bb:e6','bb:a6'],['bb:e6','bb:e6']]){
      const result=M.resolveWireConnection(s,from,to);assert.equal(result.alreadyConnected,true);assert.ok(result.targets.includes(from));
    }
    const full=M.initialState();full.wires=[wire('only','pin:23','pin:22')];
    assert.equal(M.resolveWireEndpoint(full,'pin:23').code,'no_free_contact');
    assert.equal(M.resolveWireConnection(full,'pin:23','pin:22').alreadyConnected,true);
  });
  test('wire endpoint exclusions reserve contacts without changing the circuit',()=>{
    const s=screenshotBuild();assert.equal(M.resolveWireEndpoint(s,'bb:e6',{exclude:['bb:d6']}).endpoint,'bb:c6');
    assert.equal(M.resolveWireEndpoint(s,'bb:a6',{exclude:['bb:a6']}).endpoint,'bb:b6');
    assert.equal(M.resolveWireEndpoint(s,'pin:GND2',{exclude:['pin:GND-L']}).endpoint,'rail:L+:15');
    assert.equal(M.resolveWireEndpoint(s,'bb:e6',{exclude:['bb:a6','bb:b6','bb:c6','bb:d6']}).code,'no_free_contact');
  });
  test('endpoint resolution never traverses LED, resistor or potentiometer terminals',()=>{
    const fixtures=[
      [screenshotBuild(),'bb:e6',[['bb:a6','bb:b6'],['bb:c6','bb:d6']]],
      [setup(),'bb:c6',[['bb:a6','bb:b6'],['bb:d6','bb:e6']]],
      [projectSetup('potentiometer'),'bb:h19',[['bb:f19','bb:g19'],['bb:i19','bb:j19']]],
    ];
    for(const [s,terminal,pairs] of fixtures){
      s.wires.push(...pairs.map(([from,to],i)=>wire('fill-'+i,from,to)));
      assert.equal(M.resolveWireEndpoint(s,terminal).code,'no_free_contact');
    }
    const s=projectSetup('potentiometer');assert.equal(M.resolveWireConnection(s,'bb:h18','bb:h19').alreadyConnected,undefined);
    assert.equal(M.resolveWireConnection(setup(),'bb:c6','bb:c9').alreadyConnected,undefined);
  });
  test('endpoint resolution follows permanent button pairs but never a pressed switch',()=>{
    const s=projectSetup('button');s.pressed=true;
    s.wires=[wire('fill1','bb:a16','bb:b16'),wire('fill2','bb:c16','bb:e16')];
    assert.equal(M.resolveWireEndpoint(s,'bb:d16').endpoint,'bb:c18');
    assert.equal(M.resolveWireConnection(s,'bb:d16','bb:d18').alreadyConnected,true);
    assert.equal(M.resolveWireConnection(s,'bb:d16','bb:f16').alreadyConnected,undefined);
    s.wires.push(wire('fill3','bb:a18','bb:b18'),wire('fill4','bb:c18','bb:e18'));
    assert.equal(M.resolveWireEndpoint(s,'bb:d16').code,'no_free_contact');
  });
  test('a fully occupied rail cannot spill into an adjacent rail or board pin',()=>{
    const s=M.initialState();
    for(let i=1;i<25;i+=2)s.wires.push(wire('fill-'+i,`rail:L+:${i}`,`rail:L+:${i+1}`));
    s.wires.push(wire('last','rail:L+:25','pin:22'));
    assert.equal(M.resolveWireEndpoint(s,'rail:L+:16').code,'no_free_contact');
    assert.equal(M.resolveWireConnection(s,'rail:L+:16','rail:L+:1').alreadyConnected,true);
    assert.equal(M.resolveWireEndpoint(s,'rail:L-:16').endpoint,'rail:L-:16');
  });
  test('resolution follows jumper chains and can use a free common ground header',()=>{
    const s=M.initialState();s.wires=[wire('a','pin:GND','pin:22')];
    assert.equal(M.resolveWireEndpoint(s,'pin:GND').endpoint,'pin:GND2');
    const chain=M.initialState();chain.wires=[wire('a','pin:23','bb:a1'),wire('b','bb:b1','bb:c1'),
      wire('c','bb:d1','bb:e1')];
    assert.equal(M.resolveWireEndpoint(chain,'pin:23').code,'no_free_contact');
    chain.wires[2].to='rail:R-:14';assert.equal(M.resolveWireEndpoint(chain,'pin:23').endpoint,'bb:e1');
    chain.wires.push(wire('d','bb:e1','rail:R-:18'));assert.equal(M.resolveWireEndpoint(chain,'pin:23').endpoint,'rail:R-:13');
  });
  test('the other ground header preference is symmetric, respects reservations and keeps local clicks local',()=>{
    const s=screenshotBuild(),before=JSON.stringify(s);
    assert.equal(M.resolveWireEndpoint(s,'pin:GND-R').endpoint,'pin:GND2');
    assert.equal(M.resolveWireEndpoint(s,'pin:GND',{exclude:['pin:GND-L']}).endpoint,'rail:L+:15');
    assert.equal(M.resolveWireEndpoint(s,'rail:L+:16').endpoint,'rail:L+:15');
    s.wires[1].from='pin:GND2';assert.equal(M.resolveWireEndpoint(s,'pin:GND-L').endpoint,'pin:GND');
    s.wires[1].from='pin:GND';assert.equal(JSON.stringify(s),before);
    s.wires.push(wire('left-ground','pin:GND2','bb:a24'));
    const fallback=M.resolveWireEndpoint(s,'pin:GND').endpoint;
    assert.equal(fallback,'bb:b24');assert.equal(M.electricallyConnected(s,fallback,'pin:GND'),true);
  });
  test('the shared-ground button screenshot remains valid while new ground wiring can go directly to the board',()=>{
    const s=projectSetup('button');s.wires=[wire('source','pin:23','bb:b6'),wire('ground','pin:GND','bb:c10'),
      wire('input','pin:18','bb:c16'),wire('button-ground','bb:g16','bb:d10')];
    const before=JSON.stringify(s);verdict(s,'complete');assert.equal(M.simulationState(s,{pressed:true}).ledBrightness,1);
    assert.equal(M.simulationState(s,{pressed:false}).inputLevel,'HIGH');assert.deepEqual(M.normalizeState(s),s);
    assert.equal(JSON.stringify(s),before);
    const partial=clone(s);partial.wires.pop();const link=M.resolveWireConnection(partial,'bb:f16','pin:GND');
    assert.equal(link.ok,true);assert.equal(link.to,'pin:GND2');
    partial.wires.push(wire('direct-ground',link.from,link.to));verdict(partial,'complete');assert.equal(partial.wires.length,4);
  });
  test('a compact button layout can share the grounded LED row and use three jumpers',()=>{
    const s={...M.initialState('button'),parts:{resistor:{a:'bb:c6',b:'bb:c9',ohms:330},
      led:{a:'bb:b9',b:'bb:b10'},button:{a:'bb:d8',b:'bb:d10',c:'bb:f8',d:'bb:f10'}},
      wires:[wire('source','pin:23','bb:a6'),wire('ground','pin:GND','bb:a10'),wire('input','pin:18','bb:g8')]};
    verdict(s,'complete');assert.equal(s.wires.length,3);assert.deepEqual(M.normalizeState(s),s);
    assert.equal(M.electricallyConnected(s,'bb:b10','bb:d10'),true);
    assert.equal(M.electricallyConnected(s,'bb:d8','pin:GND'),true);
    assert.equal(M.electricallyConnected(s,'pin:18','pin:GND'),false);
    const released=M.simulationState(s,{pressed:false}),pressed=M.simulationState(s,{pressed:true});
    assert.equal(released.inputLevel,'HIGH');assert.equal(released.ledBrightness,0);
    assert.equal(pressed.inputLevel,'LOW');assert.equal(pressed.ledBrightness,1);
  });
  test('physical resolution preserves wrong-pin choices for circuit validation and is pure',()=>{
    const s=screenshotBuild(),before=JSON.stringify(s),link=M.resolveWireConnection(s,'pin:22','bb:c11');
    assert.equal(link.ok,true);assert.equal(link.from,'pin:22');
    M.resolveWireEndpoint(s,'pin:23');M.resolveWireConnection(s,'pin:GND','rail:L+:16');assert.equal(JSON.stringify(s),before);
    const wrong=setup(),resolved=M.resolveWireConnection(wrong,'pin:22','bb:c6');
    wrong.wires.push(wire('wrong',resolved.from,resolved.to),wire('gnd','bb:a10','pin:GND'));verdict(wrong,'wrong_gpio');
  });
  test('the screenshot assembly can be completed by clicking occupied component leads',()=>{
    const s=screenshotBuild();
    for(const [i,[from,to]] of [['bb:c11','bb:e6'],['bb:e7','pin:GND']].entries()){
      const before=JSON.stringify(s),preview=M.resolveWireConnection(s,from,to);assert.equal(preview.ok,true);assert.equal(JSON.stringify(s),before);
      s.wires.push(wire('confirmed-'+i,preview.from,preview.to));
    }
    verdict(s,'complete');assert.deepEqual(M.normalizeState(s),s);
  });
  test('resolved connections still obey the strict workspace wire limit',()=>{
    const s=M.initialState();
    for(let row=1;row<=30;row++)for(const cols of ['ab','cd'])s.wires.push(wire(cols+row,`bb:${cols[0]}${row}`,`bb:${cols[1]}${row}`));
    assert.equal(M.resolveWireConnection(s,'pin:23','pin:34').code,'wire_limit');
    assert.equal(M.resolveWireConnection(s,'bb:a1','bb:b1').alreadyConnected,true);
  });
  test('moving a wire endpoint lifts only that wire and keeps its other endpoint fixed',()=>{
    const s=screenshotBuild(),before=JSON.stringify(s);
    assert.deepEqual(M.resolveWireMove(s,'signal','to','bb:a8'),{ok:true,from:'pin:23',to:'bb:a8',redirected:[],unchanged:false});
    assert.deepEqual(M.resolveWireMove(s,'signal','from','pin:GPIO22'),{ok:true,from:'pin:22',to:'bb:d8',redirected:[],unchanged:false});
    assert.equal(JSON.stringify(s),before);
  });
  test('moving to the same original endpoint is an explicit no-op even on a redundant wire',()=>{
    const s=screenshotBuild();assert.deepEqual(M.resolveWireMove(s,'signal','from','pin:GPIO23'),{ok:true,from:'pin:23',to:'bb:d8',redirected:[],unchanged:true});
    s.wires.push(wire('redundant','bb:a20','bb:b20'));
    assert.equal(M.resolveWireMove(s,'redundant','to','bb:b20').unchanged,true);
  });
  test('wire moves redirect occupied component contacts without moving the fixed endpoint',()=>{
    const s=screenshotBuild(),move=M.resolveWireMove(s,'signal','to','bb:e6');
    assert.deepEqual(move,{ok:true,from:'pin:23',to:'bb:d6',redirected:[{requested:'bb:e6',endpoint:'bb:d6'}],unchanged:false});
    const old=s.wires[0],edited={...old,from:move.from,to:move.to};
    assert.equal(edited.id,old.id);assert.equal(edited.color,old.color);
    const lifted={...s,wires:s.wires.slice(1)};assert.equal(M.wireIssue(lifted,move.from,move.to),null);
  });
  test('wire move checks connectivity without the original wire and rejects other redundant paths',()=>{
    const s=screenshotBuild();assert.equal(M.resolveWireMove(s,'signal','to','bb:b8').ok,true);
    assert.equal(M.resolveWireMove(s,'signal','to','pin:23').code,'already_connected');
    assert.equal(M.resolveWireMove(s,'ground','to','pin:GND2').code,'already_connected');
    s.wires.push(wire('branch','bb:a8','bb:a9'));
    assert.equal(M.resolveWireMove(s,'signal','from','bb:b9').code,'already_connected');
  });
  test('invalid wire edits return diagnostics and never mutate their source',()=>{
    const s=screenshotBuild(),before=JSON.stringify(s);
    assert.equal(M.resolveWireMove(s,'missing','to','bb:a1').code,'wire_not_found');
    assert.equal(M.resolveWireMove(s,'signal','middle','bb:a1').code,'invalid_wire_end');
    assert.equal(M.resolveWireMove(s,'signal','to','bb:z1').code,'invalid_endpoint');
    const full=setup();full.wires=[wire('move','pin:23','bb:a20'),wire('fill1','bb:a6','bb:b6'),wire('fill2','bb:d6','bb:e6')];
    assert.equal(M.resolveWireMove(full,'move','to','bb:c6').code,'no_free_contact');
    assert.equal(JSON.stringify(s),before);
  });
  test('wire moves use a released original hole and still work at the wire limit',()=>{
    const s=screenshotBuild();
    const move=M.resolveWireMove(s,'signal','to','bb:c8');assert.equal(move.ok,true);assert.equal(move.to,'bb:b8');
    const max=M.initialState();
    for(let row=1;row<=30;row++)for(const cols of ['ab','cd'])max.wires.push(wire(cols+row,`bb:${cols[0]}${row}`,`bb:${cols[1]}${row}`));
    const result=M.resolveWireMove(max,'ab1','from','pin:23');assert.equal(result.ok,true);assert.equal(result.to,'bb:b1');
    assert.equal(max.wires.length,60);
  });
  test('electricallyConnected follows copper, jumpers and permanent pairs only',()=>{
    const s=projectSetup('button');s.wires=[wire('gnd','pin:GND','rail:L+:8')];
    for(const pair of [['bb:a2','bb:e2'],['pin:GND2','rail:L+:25'],['bb:d16','bb:d18']])assert.equal(M.electricallyConnected(s,...pair),true);
    for(const pair of [['bb:e2','bb:f2'],['bb:e9','bb:e10'],['bb:c6','bb:c9'],['bb:d16','bb:f16'],['rail:L+:1','rail:R+:1']])assert.equal(M.electricallyConnected(s,...pair),false);
    const pot=projectSetup('potentiometer');assert.equal(M.electricallyConnected(pot,'bb:h18','bb:h19'),false);
    assert.equal(M.electricallyConnected(null,'bb:a1','bb:a1'),false);assert.equal(M.electricallyConnected(s,'pin:999','bb:a1'),false);
  });
  const bypassBuild=()=>({...setup({a:'bb:e5',b:'bb:e6'},{a:'bb:e7',b:'bb:e10',ohms:330}),
    wires:[wire('signal','pin:23','bb:b5'),wire('ground','bb:a6','pin:GND')]});
  const applyRepair=(state,plan)=>{
    const trial=clone(state);
    for(const [i,operation] of plan.operations.entries()){
      if(operation.kind==='moveWire'){
        const resolved=M.resolveWireMove(trial,operation.wireId,operation.end,operation.target);assert.equal(resolved.ok,true);
        assert.equal(resolved.from,operation.from);assert.equal(resolved.to,operation.to);
        Object.assign(trial.wires.find(w=>w.id===operation.wireId),{from:resolved.from,to:resolved.to});
      }else{
        assert.equal(M.wireIssue(trial,operation.from,operation.to),null);
        trial.wires.push(wire('repair-test-'+i,operation.from,operation.to));
      }
    }
    return trial;
  };
  test('direct LED bypass gets concrete source-wire move and resistor-to-LED steps',()=>{
    const s=bypassBuild(),before=JSON.stringify(s);verdict(s,'missing_current_limit');
    const plan=M.repairPlan(s);assert.ok(plan);assert.equal(plan.operations.length,2);
    const [move,connect]=plan.operations;assert.equal(move.kind,'moveWire');assert.equal(move.wireId,'signal');assert.equal(move.end,'to');
    assert.equal(move.from,'pin:23');assert.equal(move.to,'bb:d7');assert.equal(move.target,'bb:d7');assert.ok(move.targets.includes('bb:b5'));
    assert.equal(connect.kind,'connect');assert.equal(M.netOf(connect.from),'strip:L:10');assert.equal(M.netOf(connect.to),'strip:L:5');
    assert.match(move.title,/B5.*D7/);assert.match(connect.why,/long \(\+\) lead/);
    assert.equal(JSON.stringify(s),before);const repaired=applyRepair(s,plan);verdict(repaired,'complete');
    assert.equal(repaired.wires[0].id,s.wires[0].id);assert.equal(repaired.wires[0].color,s.wires[0].color);
  });
  test('bypass repair accepts reversed wire direction, either breadboard half and shifted layouts',()=>{
    for(const half of [['e','b','a'],['j','g','f']])for(const row of [2,8,16]){
      const s=setup({a:`bb:${half[0]}${row}`,b:`bb:${half[0]}${row+1}`},{a:`bb:${half[0]}${row+2}`,b:`bb:${half[0]}${row+5}`,ohms:330});
      s.wires=[wire('signal',`bb:${half[1]}${row}`,'pin:23'),wire('ground','pin:GND2',`bb:${half[2]}${row+1}`)];
      const plan=M.repairPlan(s);assert.ok(plan);assert.equal(plan.operations[0].end,'from');verdict(applyRepair(s,plan),'complete');
    }
  });
  test('bypass repair only proposes a fully validated final circuit and never guesses other repairs',()=>{
    for(const s of [null,M.initialState(),valid()])assert.equal(M.repairPlan(s),null);
    const reversed=bypassBuild();[reversed.parts.led.a,reversed.parts.led.b]=[reversed.parts.led.b,reversed.parts.led.a];assert.equal(M.repairPlan(reversed),null);
    const power=bypassBuild();power.wires[0].from='pin:3V3';assert.equal(M.repairPlan(power),null);
    const extra=bypassBuild();extra.wires.push(wire('power','pin:3V3','bb:a7'));assert.equal(M.repairPlan(extra),null);
    const shorted=bypassBuild();shorted.wires.push(wire('short','bb:a7','bb:a10'));assert.equal(M.repairPlan(shorted),null);
    const twoPaths=bypassBuild();twoPaths.wires.push(wire('duplicate-path','pin:22','bb:c5'));assert.equal(M.repairPlan(twoPaths),null);
  });
  console.log(JSON.stringify({result:'passed',tests:passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});

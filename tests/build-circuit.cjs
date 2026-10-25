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
  console.log(JSON.stringify({result:'passed',tests:passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});

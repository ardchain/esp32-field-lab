const assert=require('node:assert/strict');

(async()=>{
  const M=await import('../dist/build-circuit.js');
  let passed=0;
  function test(name,fn){fn();passed++;console.log('PASS '+name);}
  const wire=(id,from,to,color='#d4ac58')=>({id,from,to,color});
  const clone=value=>structuredClone(value);
  const setup=(led={a:'bb:e9',b:'bb:e10'},resistor={a:'bb:c6',b:'bb:c9',ohms:330})=>
    ({...M.initialState(),parts:{led,resistor}});
  const valid=()=>({...setup(),wires:[wire('signal','pin:23','bb:a6'),wire('ground','bb:a10','pin:GND')]});
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
  console.log(JSON.stringify({result:'passed',tests:passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});

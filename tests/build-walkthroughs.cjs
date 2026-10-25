const assert=require('node:assert/strict');

(async()=>{
  const M=await import('../dist/build-circuit.js');
  const {getBuildProject,buildSketch}=await import('../dist/build-projects.js');
  const {getWalkthrough}=await import('../dist/build-walkthroughs.js');
  let passed=0;
  function test(name,fn){fn();passed++;console.log('PASS '+name);}
  const clone=value=>structuredClone(value);
  const wire=(id,from,to)=>({id,from,to,color:'#d4ac58'});
  const placed=id=>({...M.initialState(id),parts:clone(getBuildProject(id).placements)});
  const build=id=>{
    const s=placed(id);s.wires=[wire('source','pin:23','bb:a6'),wire('ground','bb:a10','pin:GND')];
    if(id==='button')s.wires.push(wire('input','pin:18','bb:a16'),wire('return','bb:j16','pin:GND2'));
    if(id==='potentiometer')s.wires.push(wire('low','pin:GND2','bb:f18'),wire('wiper','pin:34','bb:f19'),wire('high','pin:3V3','bb:f20'));
    return s;
  };
  const afterLed=()=>({...M.initialState(),parts:{led:{a:'bb:e8',b:'bb:e9'},resistor:{a:'bb:c6',b:'bb:c9',ohms:330}},
    wires:[wire('source','pin:23','bb:a8'),wire('return','pin:GND2','bb:a6')]});
  function act(state,action,index){
    const next=clone(state);
    if(action.type==='place'){
      assert.equal(M.placementIssue(next,action.kind,action.part),null);next.parts[action.kind]=clone(action.part);
    }else if(action.type==='wire'){
      assert.equal(M.wireIssue(next,action.from,action.to),null);
      let id='test-step-'+index;while(next.wires.some(w=>w.id===id))id+='x';next.wires.push(wire(id,action.from,action.to));
    }else assert.fail('Unexpected walkthrough action '+action.type);
    return next;
  }
  function complete(start){
    let state=clone(start),count=0;
    while(!M.validateCircuit(state).ok){
      assert.ok(count<20,'Guide did not terminate');
      const before=JSON.stringify(state),steps=getWalkthrough(state);assert.equal(JSON.stringify(state),before,'Guide changed the draft');
      assert.equal(new Set(steps.map(s=>s.id)).size,steps.length,'Guide IDs must be stable and unique');
      const step=steps.find(s=>!s.complete&&s.action);assert.ok(step,'No actionable step for '+JSON.stringify(M.validateCircuit(state)));
      state=act(state,step.action,count++);
    }
    const steps=getWalkthrough(state);assert.equal(steps.find(s=>s.id==='run').complete,true);
    assert.ok(steps.filter(s=>s.type==='connection'||s.type==='part').every(s=>s.complete));
    return {state,count};
  }

  test('all three fresh walkthroughs terminate in physically valid working circuits',()=>{
    for(const id of ['blink','button','potentiometer']){
      const initial=M.initialState(id),before=JSON.stringify(initial),{state,count}=complete(initial);
      assert.equal(JSON.stringify(initial),before);assert.ok(count>=4&&count<=10);assert.equal(state.project,id);
      if(id==='button')assert.equal(M.simulationState(state,{pressed:true}).ledBrightness,1);
      if(id==='potentiometer')assert.notEqual(M.simulationState(state,{value:0}).adc,M.simulationState(state,{value:100}).adc);
    }
  });
  test('a valid resistor after the LED is explained without requesting a rewire',()=>{
    const state=afterLed();assert.equal(M.validateCircuit(state).ok,true);
    const steps=getWalkthrough(state),source=steps.find(s=>s.id==='indicator-source'),junction=steps.find(s=>s.id==='indicator-junction');
    assert.equal(source.complete,true);assert.equal(source.action,null);assert.match(source.why,/ground side/);
    assert.match(junction.title,/cathode/);assert.equal(junction.complete,true);assert.match(junction.instruction,/hidden metal strip/);
    assert.ok(steps.filter(s=>s.type==='connection').every(s=>s.complete&&!s.action));
  });
  test('a partial resistor-after-LED draft retains its route and completes through actions',()=>{
    const state=afterLed();state.wires.pop();const initial=JSON.stringify(state);
    const guide=getWalkthrough(state);assert.equal(guide.find(s=>s.id==='indicator-source').complete,true);
    const {state:done,count}=complete(state);assert.equal(count,1);assert.equal(JSON.stringify(state),initial);
    assert.equal(done.wires[0].from,'pin:23');assert.equal(done.wires[0].to,'bb:a8');
  });
  test('rail-based paths highlight their real intermediate jumper contacts',()=>{
    const state=placed('blink');state.wires=[wire('a','pin:23','rail:L+:1'),wire('b','rail:L+:25','bb:a6'),
      wire('c','bb:a10','rail:R-:4'),wire('d','rail:R-:24','pin:GND2')];
    assert.equal(M.validateCircuit(state).ok,true);
    const steps=getWalkthrough(state),source=steps.find(s=>s.id==='indicator-source'),back=steps.find(s=>s.id==='indicator-return');
    for(const id of ['pin:23','rail:L+:1','rail:L+:25','bb:a6'])assert.ok(source.targets.includes(id),id);
    for(const id of ['bb:a10','rail:R-:4','rail:R-:24','pin:GND2'])assert.ok(back.targets.includes(id),id);
    assert.equal(source.action,null);assert.equal(back.action,null);assert.match(source.instruction,/highlighted contacts and jumper/);
  });
  test('reversed potentiometer outer wiring is honored and the wiper remains GPIO34',()=>{
    const state=build('potentiometer');[state.wires[2].to,state.wires[4].to]=[state.wires[4].to,state.wires[2].to];
    assert.equal(M.validateCircuit(state).potReversed,true);
    const guide=getWalkthrough(state),high=guide.find(s=>s.id==='pot-power'),low=guide.find(s=>s.id==='pot-ground'),wiper=guide.find(s=>s.id==='pot-wiper');
    assert.ok(high.targets.includes('bb:h18'));assert.ok(low.targets.includes('bb:h20'));assert.ok(wiper.targets.includes('bb:h19'));
    for(const step of [high,low,wiper])assert.equal(step.complete,true);
    assert.match(high.why,/reverses the dial direction/);assert.match(wiper.code.explanation,/physical ADC readings can differ/);
  });
  test('the opposite button pair can be GPIO18 without changing the input explanation',()=>{
    const state=build('button');state.wires[2].to='bb:j18';state.wires[3].from='bb:a18';
    assert.equal(M.validateCircuit(state).ok,true);const guide=getWalkthrough(state);
    const input=guide.find(s=>s.id==='button-input'),ground=guide.find(s=>s.id==='button-ground');
    assert.equal(input.complete,true);assert.ok(input.targets.includes('bb:f16'));assert.equal(ground.complete,true);
    assert.match(input.why,/pull-up.*HIGH/);assert.match(ground.why,/LOW/);
  });
  test('existing parts, aliases, wire colors and IDs are never changed by guidance',()=>{
    for(const id of ['blink','button','potentiometer']){
      const state=build(id);state.wires[0].from='pin:GPIO23';state.wires[0].color='#abcdef';state.wires[0].id='custom-id';
      const before=JSON.stringify(state);getWalkthrough(state);assert.equal(JSON.stringify(state),before);
    }
  });
  test('a direct LED bypass blocks connection actions until the explicit repair is applied',()=>{
    const state={...M.initialState(),parts:{led:{a:'bb:e5',b:'bb:e6'},resistor:{a:'bb:e7',b:'bb:e10',ohms:330}},
      wires:[wire('source','pin:23','bb:b5'),wire('ground','bb:a6','pin:GND')]};
    assert.equal(M.validateCircuit(state).code,'missing_current_limit');
    const steps=getWalkthrough(state);assert.ok(steps.filter(s=>s.type==='connection').every(s=>!s.action));
    assert.ok(steps.filter(s=>s.type==='connection'&&!s.complete).every(s=>s.blocked));
    const repair=M.repairPlan(state),move=repair.operations[0],repaired=clone(state);
    Object.assign(repaired.wires.find(w=>w.id===move.wireId),{from:move.from,to:move.to});
    assert.ok(getWalkthrough(repaired).some(s=>s.type==='connection'&&!s.complete&&s.action));complete(repaired);
  });
  test('connection completion never treats resistor, LED or pot resistance as copper',()=>{
    const state=placed('blink');state.parts.led={a:'bb:e14',b:'bb:e15'};
    const guide=getWalkthrough(state),junction=guide.find(s=>s.id==='indicator-junction');
    assert.equal(junction.complete,false);assert.equal(junction.action.type,'wire');
    assert.equal(M.electricallyConnected(state,state.parts.resistor.a,state.parts.resistor.b),false);
    assert.equal(M.electricallyConnected(state,state.parts.led.a,state.parts.led.b),false);
    const pot=placed('potentiometer'),potGuide=getWalkthrough(pot);
    for(const id of ['pot-ground','pot-power','pot-wiper'])assert.equal(potGuide.find(s=>s.id===id).complete,false);
    assert.equal(M.electricallyConnected(pot,'bb:h18','bb:h19'),false);assert.equal(M.electricallyConnected(pot,'bb:h19','bb:h20'),false);
  });
  test('code snippets refer to actual supplied Arduino statements and selected interval',()=>{
    for(const project of ['blink','button','potentiometer']){
      const state=build(project);state.interval=250;const sketch=buildSketch(state),guide=getWalkthrough(state);
      for(const step of guide)if(step.code)assert.ok(sketch.includes(step.code.line),project+': '+step.code.line);
      assert.match(guide.find(s=>s.id==='run').why,/does not compile/);
      if(project==='blink')assert.match(guide.find(s=>s.id==='run').code.explanation,/250 ms.*500 ms/);
    }
  });
  test('existing walkthrough-like wire IDs cannot corrupt hypothetical planning',()=>{
    const state=afterLed();state.wires.pop();state.wires[0].id='walkthrough-0';
    const guide=getWalkthrough(state);assert.equal(guide.find(s=>s.id==='indicator-source').complete,true);
    assert.match(guide.find(s=>s.id==='indicator-source').why,/ground side/);complete(state);
  });
  test('a partial reversed potentiometer keeps its chosen power polarity',()=>{
    const state=build('potentiometer');[state.wires[2].to,state.wires[4].to]=[state.wires[4].to,state.wires[2].to];
    state.wires=state.wires.filter(w=>w.id!=='wiper');
    const guide=getWalkthrough(state);assert.equal(guide.find(s=>s.id==='pot-power').complete,true);
    const {state:done,count}=complete(state);assert.equal(count,1);assert.equal(M.validateCircuit(done).potReversed,true);
  });
  test('occupied suggested coordinates produce a different valid layout without erasing wires',()=>{
    const state=M.initialState();state.wires.push(wire('keep','pin:22','bb:c6'));
    const {state:done}=complete(state);assert.notEqual(done.parts.resistor.a,'bb:c6');
    assert.deepEqual(done.wires.find(w=>w.id==='keep'),state.wires[0]);assert.equal(M.validateCircuit(done).ok,true);
  });
  test('a shorted draft has no connection actions and preserves the fault for repair',()=>{
    const state=M.initialState();state.wires.push(wire('short','pin:23','pin:GND'));
    const before=JSON.stringify(state),steps=getWalkthrough(state);
    assert.equal(JSON.stringify(state),before);assert.equal(M.validateCircuit(state).code,'short_gpio');
    assert.equal(steps.some(s=>s.action?.type==='wire'),false);assert.equal(steps.find(s=>s.id==='run').complete,false);
  });
  test('an existing wrong GPIO does not hide space for the missing button',()=>{
    const state=placed('button');state.parts.button=null;
    state.wires=[wire('wrong-source','pin:22','bb:a6'),wire('ground','bb:a10','pin:GND')];
    const before=JSON.stringify(state),steps=getWalkthrough(state),button=steps.find(s=>s.id==='part-button');
    assert.equal(button.complete,false);assert.equal(button.action?.type,'place');assert.equal(button.action.kind,'button');
    assert.doesNotMatch(button.instruction,/no clear space|overlapping/i);
    const next=act(state,button.action,0);assert.equal(M.validateCircuit(next).code,'wrong_gpio');
    assert.equal(getWalkthrough(next).some(s=>s.type==='connection'&&s.action),false);
    assert.equal(JSON.stringify(state),before);assert.deepEqual(next.wires,state.wires);
  });
  test('a part whose leads share copper needs correction rather than a Complete badge',()=>{
    for(const [project,kind,part] of [
      ['blink','led',{a:'bb:a14',b:'bb:b14'}],
      ['blink','resistor',{a:'bb:a4',b:'bb:d4',ohms:330}],
      ['button','button',{a:'bb:a16',b:'bb:a18',c:'bb:c16',d:'bb:c18'}],
      ['potentiometer','potentiometer',{a:'bb:f18',w:'bb:g18',b:'bb:h18'}],
    ]){
      const state=placed(project);state.parts[kind]=part;
      const before=JSON.stringify(state),step=getWalkthrough(state).find(s=>s.id==='part-'+kind);
      assert.equal(step.complete,false);assert.equal(step.action,null);
      assert.match(step.instruction,/rotate|Rotate/);assert.equal(JSON.stringify(state),before);
    }
  });
  console.log(JSON.stringify({result:'passed',tests:passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});

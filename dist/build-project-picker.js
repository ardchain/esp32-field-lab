// The course selector uses the same paper/ink styling on desktop and touch.
export function mountProjectPicker(host,{projects,value,onChange=()=>{}}={}) {
  const choices=projects.filter(project=>project?.id);
  let selected=choices.some(project=>project.id===value)?value:choices[0]?.id;
  let open=false,typeahead='',typeaheadAt=0;
  host.classList.add('build-project-picker');
  const heading=document.createElement('h1');
  const trigger=document.createElement('button');
  trigger.id='build-project';trigger.type='button';trigger.className='build-project-trigger';
  trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-controls','build-project-options');
  const number=document.createElement('span');number.className='build-project-number';number.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.className='build-project-title';
  const arrow=document.createElement('span');arrow.className='build-project-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='⌄';
  trigger.append(number,title,arrow);heading.append(trigger);
  const list=document.createElement('div');list.id='build-project-options';list.className='build-project-options';list.hidden=true;
  list.setAttribute('role','listbox');list.setAttribute('aria-label','Practice by lesson');
  const options=choices.map(project=>{
    const option=document.createElement('button');option.type='button';option.className='build-project-option';option.dataset.projectId=project.id;
    option.setAttribute('role','option');option.tabIndex=-1;
    const num=document.createElement('span');num.className='build-project-number';num.textContent=project.lessonNumber||'';num.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.className='build-project-title';label.textContent=project.lessonTitle||project.title;
    const tick=document.createElement('span');tick.className='build-project-check';tick.setAttribute('aria-hidden','true');tick.textContent='✓';
    option.setAttribute('aria-label',`Lesson ${project.lessonNumber}: ${label.textContent}`);
    option.append(num,label,tick);option.addEventListener('click',()=>choose(project.id));list.append(option);return option;
  });
  host.replaceChildren(heading,list);
  function render(){
    const project=choices.find(project=>project.id===selected);
    number.textContent=project?.lessonNumber||'';title.textContent=project?.lessonTitle||project?.title||'Choose a lesson';
    trigger.setAttribute('aria-label',`Choose a practice lesson. ${project?.lessonNumber||''}: ${title.textContent}`);
    trigger.setAttribute('aria-expanded',String(open));list.hidden=!open;host.dataset.open=String(open);
    options.forEach(option=>{option.setAttribute('aria-selected',String(option.dataset.projectId===selected));option.tabIndex=open&&option.dataset.projectId===selected?0:-1;});
  }
  function focusOption(index){const next=options[(index+options.length)%options.length];if(!next)return;options.forEach(option=>{option.tabIndex=option===next?0:-1;});next.focus({preventScroll:true});next.scrollIntoView({block:'nearest'});}
  function close(restore=false){open=false;typeahead='';render();if(restore)trigger.focus({preventScroll:true});}
  function show(edge){if(!options.length)return;open=true;render();const current=options.findIndex(option=>option.dataset.projectId===selected);focusOption(edge==='first'?0:edge==='last'?options.length-1:Math.max(0,current));}
  function choose(id){const changed=id!==selected;selected=id;close(true);if(changed)onChange(id);}
  function triggerClick(){open?close():show();}
  function keydown(event){
    if(open)event.stopPropagation();
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close(true);return;}
    if(!open&&event.target===trigger&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();show(event.key==='Home'?'first':event.key==='End'?'last':undefined);return;
    }
    if(!open||!list.contains(event.target))return;
    const index=options.indexOf(document.activeElement);
    const destinations={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:options.length-1};
    if(event.key in destinations){event.preventDefault();event.stopPropagation();focusOption(destinations[event.key]);return;}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();if(options[index])choose(options[index].dataset.projectId);return;}
    if(event.key==='Tab')return; // Native focus navigation closes it through focusout.
    // Typing a title initial works without adding a search field for three items.
    if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();event.stopPropagation();const now=performance.now();typeahead=now-typeaheadAt<650?typeahead+event.key.toLowerCase():event.key.toLowerCase();typeaheadAt=now;
      let found=choices.findIndex(project=>(project.lessonTitle||project.title).toLowerCase().startsWith(typeahead));
      if(found<0){typeahead=event.key.toLowerCase();found=choices.findIndex(project=>(project.lessonTitle||project.title).toLowerCase().startsWith(typeahead));}
      if(found>=0)focusOption(found);
    }
  }
  function outside(event){if(open&&!host.contains(event.target))close();}
  function focusout(event){
    if(event.relatedTarget&&host.contains(event.relatedTarget))return;
    if(event.relatedTarget){if(open)close();return;}
    // Native pointer focus may temporarily report body between focusout and
    // focusin. Wait for that transition before hiding the clicked option.
    requestAnimationFrame(()=>{if(open&&!host.contains(document.activeElement))close();});
  }
  trigger.addEventListener('click',triggerClick);host.addEventListener('keydown',keydown);host.addEventListener('focusout',focusout);
  document.addEventListener('pointerdown',outside,true);render();
  return {
    setValue(id){if(choices.some(project=>project.id===id)){selected=id;render();}},
    dispose(){document.removeEventListener('pointerdown',outside,true);host.removeEventListener('keydown',keydown);host.removeEventListener('focusout',focusout);trigger.removeEventListener('click',triggerClick);host.replaceChildren();host.classList.remove('build-project-picker');},
  };
}

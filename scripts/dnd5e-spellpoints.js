var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

const MODULE_NAME = 'ningov-spellpoints';

Handlebars.registerHelper("spFormat", (path, ...args) => {
  return game.i18n.format(path, args[0].hash);
});

class SpellPoints {
  static get settings() {
    return mergeObject(this.defaultSettings, game.settings.get(MODULE_NAME, 'settings'));
  }
  /**
   * Get default settings object.
   * @returns ChatPortraitSetting
   */
  static get defaultSettings() {
    return {
      spEnableSpellpoints: true,
      spResource: 'Spell Points',
      spAutoSpellpoints: false,
      spFormula: 'DMG',
      spellPointsByLevel: {1:4,2:6,3:14,4:17,5:27,6:32,7:38,8:44,9:57,10:64,11:73,12:73,13:83,14:83,15:94,16:94,17:107,18:114,19:123,20:133},
      spellPointsCosts: {1:2,2:3,3:5,4:6,5:7,6:9,7:10,8:11,9:13},
      spEnableVariant: false,
      spLifeCost: 2,
      spMixedMode: false,
    };
  }
  
  static isModuleActive(){
    return true
    //return game.settings.get(MODULE_NAME, 'spEnableSpellpoints');
  }
  
  static isActorCharacter(actor){
    return getProperty(actor, "data.type") == "character";
  }
  
  static isMixedActorSpellPointEnabled(actor){
    console.log(actor);
    if (actor.flags !== undefined) {
      if (actor.flags.dnd5espellpoints !== undefined) {
        if (actor.flags.dnd5espellpoints.enabled !== undefined ){
          return actor.flags.dnd5espellpoints.enabled
        }
      }
    }
    return false;
  }
  
  /** check what resource is spellpoints on this actor **/
  static getSpellPointsResource(actor) {
    let _resources = getProperty(actor, "data.data.resources");
    for (let r in _resources) {
      if (_resources[r].label == this.settings.spResource) {
        return {'values'  : _resources[r],'key'     : r};
        break;
      }
    }
    return false;
  }

  static getSpellPointsItems(actor) {
    let _items = getProperty(actor, "items")
    let _focuses = new Map()
    _items.forEach((item)=>{
      if(!(item.data.type=="consumable")){
        return
      }
      if(!(item.data.data.attunement==2)){
        return
      }
      console.log(item)
      if(item.data.data.uses.max<=0){
        return
      }
      item.effects.forEach((effect)=>{
        if(effect.data.label==this.settings.spResource){
          _focuses.set(item._id,item)
        }
      })
    })
    console.log(_focuses)
    return _focuses
  }

  static getTotalSpellPoints(focuses) {
    let _totalPoints = 0
    console.log(focuses)
    focuses.forEach((focus)=>{
      _totalPoints += focus.data.data.uses.value
    })
    return _totalPoints
  }

  static reduceSpellPoints(points,focuses) {
    let remainingPoints = points
    focuses.forEach((focus)=>{
      if(remainingPoints<=0){
        return
      }
      let focusPoints = focus.data.data.uses.value
      if(focusPoints<=remainingPoints){
        remainingPoints -= focusPoints
        focus.update({data:{uses:{value:0}}})
      }else{
        focus.update({data:{uses:{value:focusPoints-remainingPoints}}})
        remainingPoints = 0
      }
    })
  }

  static castSpell(actor, update) {
    console.log('Cast Spell',actor, update);
    /** do nothing if module is not active **/ 
    if (!SpellPoints.isModuleActive() || !SpellPoints.isActorCharacter(actor))
      return update;
    
    console.log(MODULE_NAME, 'active, is actor');

    /* if mixedMode active Check if SpellPoints is enabled for this actor */
    if (this.settings.spMixedMode && !SpellPoints.isMixedActorSpellPointEnabled(actor.data))
      return update;
    
     console.log(MODULE_NAME, '!spMixedMode, isMixedActorSpellPointEnabled');

    let spell = getProperty(update, "data.spells");
    if (!spell || spell === undefined)
      return update;
    
    let hp = getProperty(update, "data.attributes.hp.value");
    //let spellPointResource = SpellPoints.getSpellPointsResource(actor);
    let focuses = SpellPoints.getSpellPointsItems(actor);

    if (focuses.size<=0){
      ChatMessage.create({
        content: "<i style='color:red;'>" + game.i18n.format("ningov-spellpoints.actorNoSP", {ActorName: actor.data.name, SpellPoints: this.settings.spResource }) + "</i>",
        speaker: ChatMessage.getSpeaker({ alias: actor.data.name })
      });
      return {};
    }

    /** check if is pact magic **/
    let isPact = false;
    if (getProperty(update, "data.spells.pact") !== undefined) {
      isPact = true;
    } 
    
    
     /** find the spell level just cast */
    const spellLvlNames = ["spell1", "spell2", "spell3", "spell4", "spell5", "spell6", "spell7", "spell8", "spell9", "pact"];
    let spellLvlIndex = spellLvlNames.findIndex(name => { return getProperty(update, "data.spells." + name) });

    let spellLvl = spellLvlIndex + 1;
    if (isPact)
      spellLvl = actor.data.data.spells.pact.level;
    
    //** slot calculation **/
    const origSlots = actor.data.data.spells;
    const preCastSlotCount = getProperty(origSlots, spellLvlNames[spellLvlIndex] + ".value");
    const postCastSlotCount = getProperty(update, "data.spells." + spellLvlNames[spellLvlIndex] + ".value");
    let maxSlots = getProperty(origSlots, spellLvlNames[spellLvlIndex] + ".max");
    
    let slotCost = preCastSlotCount - postCastSlotCount;

    /** restore slots to the max **/
    if (typeof maxSlots === undefined) {
      maxSlots = 1;
      update.data.spells[spellLvlNames[spellLvlIndex]].max = maxSlots;
    }
    update.data.spells[spellLvlNames[spellLvlIndex]].value = maxSlots;
        
    //const maxSpellPoints = actor.data.data.resources[spellPointResource.key].max;
    //const actualSpellPoints = actor.data.data.resources[spellPointResource.key].value;
    const actualSpellPoints = SpellPoints.getTotalSpellPoints(focuses)
   
    /* get spell cost in spellpoints */
    const spellPointCost = this.settings.spellPointsCosts[spellLvl];
    
    if (actualSpellPoints - spellPointCost >= 0 ) {
      SpellPoints.reduceSpellPoints(spellPointCost,focuses)
    } else { 
      ChatMessage.create({
        
        content: "<i style='color:red;'>"+game.i18n.format("ningov-spellpoints.notEnoughSp", { ActorName : actor.data.name, SpellPoints: this.settings.spResource })+"</i>",
        speaker: ChatMessage.getSpeaker({ alias: actor.data.name })
      });
    }
    
    return update;
  }
  
  static checkDialogSpellPoints(dialog, html, formData){
    if (!SpellPoints.isModuleActive())
      return;
    
    let actor = getProperty(dialog, "item.options.actor");
    
    /** check if actor is a player character **/
    if(!this.isActorCharacter(actor))
      return;
    
    console.log(MODULE_NAME,'checkDialogSpellPoints', actor, dialog, html, formData);
    
    /* if mixedMode active Check if SpellPoints is enabled for this actor */
    if (this.settings.spMixedMode && !SpellPoints.isMixedActorSpellPointEnabled(actor.data))
      return;
  
    /** check if this is a spell **/
    let isSpell = false;
    if ( dialog.item.data.type === "spell" )
      isSpell = true;
    
    console.log(MODULE_NAME,'is spell');
    
    const spell = dialog.item.data;
    // spell level can change later if casting it with a greater slot, baseSpellLvl is the default
    const baseSpellLvl = spell.data.level;
    
    if (!isSpell)
      return;
    const focuses = SpellPoints.getSpellPointsItems(actor)
    const actualSpellPoints = SpellPoints.getTotalSpellPoints(focuses)
    console.log(MODULE_NAME,"focuses",focuses,"total Points",actualSpellPoints)

    let spellPointCost = this.settings.spellPointsCosts[baseSpellLvl];
    
    if (actualSpellPoints - spellPointCost < 0) {
      const messageNotEnough = game.i18n.format("ningov-spellpoints.youNotEnough", {SpellPoints: this.settings.spResource });
      $('#ability-use-form', html).append('<div class="spError">'+messageNotEnough+'</div>');
    }

    let copyButton = $('.dialog-button', html).clone();
    $('.dialog-button', html).addClass('original').hide();
    copyButton.addClass('copy');
    $('.dialog-buttons', html).append(copyButton);
    
    html.on('click','.dialog-button.copy', function(e){
      /** if consumeSlot we ignore cost, go on and cast or if variant active **/
      if (!$('input[name="consumeSlot"]',html).prop('checked') 
        || SpellPoints.settings.spEnableVariant) {
        console.log(MODULE_NAME,'Variantactive');    
        $('.dialog-button.original', html).trigger( "click" );
      } else if ($('select[name="level"]', html).length > 0) {
        let spellLvl = $('select[name="level"]', html).val();
        console.log(MODULE_NAME,'spellLvl',spellLvl);
        spellPointCost = SpellPoints.settings.spellPointsCosts[spellLvl];
        console.log(MODULE_NAME,'spellPointCost',spellPointCost);
        if (actualSpellPoints - spellPointCost < 0) {
          ui.notifications.error("You don't have enough: '" + SpellPoints.settings.spResource + "' to cast this spell");
          dialog.close();
        } else {
          $('.dialog-button.original', html).trigger( "click" );
        }
      }
    })
  }
  
  /* params:
  * actor(obj) = dnd5e actor
  * item(obj) = the item being dropped updated
  * action(string) = create/update
  */
  
  static calculateSpellPoints(actor, item, actionString) {
    if (!this.isModuleActive() || !this.isActorCharacter(actor))
      return;
    
    console.log(MODULE_NAME,'calculateSpellPoints actor',actor);
    console.log(MODULE_NAME,'calculateSpellPoints item',item);
    console.log(MODULE_NAME,'calculateSpellPoints actionString',actionString);
    
    if (!this.settings.spAutoSpellpoints) {
      return;
    }
    /* if mixedMode active Check if SpellPoints is enabled for this actor */
    if (this.settings.spMixedMode && !SpellPoints.isMixedActorSpellPointEnabled(actor.data))
      return;
    
    
    /* updating or dropping a class item */
    if (getProperty(item, 'type') !== 'class')
      return;
    
    const spellcasting = getProperty(item.data, 'spellcasting');
    const classLevel = getProperty(item.data, 'levels');
    console.log({spellcasting});
    
    const classDroppedName = getProperty(item, 'name');
    
    // check if this is the orignal name or localized with babele
    if (getProperty(item, 'flags.babele.translated')){
      let originalName = getProperty(item, 'flags.babele.originalName');
    } else {
      let originalName = classDroppedName;
    }
    
    console.log(actor);
    //const classItem = actor.items.find(i => i.name === "Ranger");
    const actorClasses = actor.items.filter(i => i.type === "class");
    const classItem = actor.items.getName(classDroppedName);
    console.log('Dropped Class=',classDroppedName);
    console.log('Actor Item=',classItem);
    console.log('actorClasses=',actorClasses);
    
    let spellPointResource = this.getSpellPointsResource(actor);
    
    const actorName = actor.data.name;
    
    if (!spellPointResource) {
      ui.notifications.error("SPELLPOINTS: Cannot find resource '" + this.settings.spResource + "' on " + actorName + " character sheet!");
      return;
    }

    let SpellPointsMax = 0;
    
    for (let c of actorClasses){
      console.log(c);
      /* spellcasting: pact; full; half; third; artificier; none; **/
      let spellcasting = c.data.data.spellcasting;
      let level = c.data.data.levels;
      switch(spellcasting) {
        case 'full':
          SpellPointsMax += this.settings.spellPointsByLevel[level];
          break;
        case 'half':
          SpellPointsMax += this.settings.spellPointsByLevel[Math.ceil(level/2)];
          break;
        case 'third':
          SpellPointsMax += this.settings.spellPointsByLevel[Math.ceil(level/3)];
          break;
        default:
          SpellPointsMax += 0;
      }
    }
    if (SpellPointsMax > 0) {
      let updateActor = {[`data.resources.${spellPointResource.key}.max`] : SpellPointsMax};
      actor.update(updateActor);
      ui.notifications.info("SPELLPOINTS: Found resource '" + this.settings.spResource + "' on " + actorName + " character sheet! Your Maximum "+ this.settings.spResource +" have been updated.");
    }
  }
  
  /**
  * mixed Mode add a button to spell sheet 
  * 
  **/
  
  static mixedMode(app, html, data){
    console.log(data)
    if (!this.isModuleActive() || !this.settings.spMixedMode || data.actor.type != "character") {
      return;
    }
    
    let checked = "";
    if (SpellPoints.isMixedActorSpellPointEnabled(data.actor)) {
      checked = "checked";
    }
    let html_checkbox = '<div class="spEnable flexrow "><label><i class="fas fa-magic"></i>&nbsp;';
    html_checkbox += game.i18n.localize('ningov-spellpoints.use-spellpoints');
    
    html_checkbox += '<input name="flags.dnd5espellpoints.enabled" '+checked+' class="spEnableInput visually-hidden" type="checkbox" value="1">';
    html_checkbox += ' <i class="spEnableCheck fas"></i>';
    html_checkbox += '</label></div>';
    $('.tab.spellbook', html).prepend(html_checkbox);
  }
  
} /** END SpellPoint Class **/


/**
* SPELL POINTS APPLICATION SETTINGS FORM
*/
class SpellPointsForm extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize('ningov-spellpoints.form-title'),
      id: 'spellpoints-form',
      template: `modules/${MODULE_NAME}/templates/spellpoint-config.html`,
      width: 500,
      closeOnSubmit: true
    });
  }
  
  getData(options) {
    return mergeObject({
      spFormulas: {
          'DMG': game.i18n.localize('ningov-spellpoints.DMG')
          //'AM': game.i18n.localize('dnd5e-spellpoints.AM')
      }
    }, this.reset ? SpellPoints.defaultSettings :
      mergeObject(SpellPoints.defaultSettings, game.settings.get(MODULE_NAME, 'settings')));
  }
  
  onReset() {
    this.reset = true;
    this.render();
  }
  
  _updateObject(event, formData) {
    return __awaiter(this, void 0, void 0, function* () {
      let settings = mergeObject(SpellPoints.settings, formData, { insertKeys: true, insertValues: true });
      yield game.settings.set(MODULE_NAME, 'settings', settings);
    });
  }
  activateListeners(html) {
    super.activateListeners(html); 
    html.find('button[name="reset"]').click(this.onReset.bind(this));
  }
} /** end SpellPointForm **/

Hooks.on('init', () => {
  console.log('SpellPoints init');
  /** should spellpoints be enabled */
  game.settings.registerMenu(MODULE_NAME, MODULE_NAME, {
    name: "ningov-spellpoints.form",
    label: "ningov-spellpoints.form-title",
    hint: "ningov-spellpoints.form-hint",
    icon: "fas fa-magic",
    type: SpellPointsForm,
    restricted: true
  });

  game.settings.register(MODULE_NAME, "settings", {
    name: "Spell Points Settings",
    scope: "world",
    default: SpellPointsForm.defaultSettings,
    type: Object,
    config: false,
    onChange: (x) => window.location.reload()
  });
});

// collate all preUpdateActor hooked functions into a single hook call
Hooks.on("preUpdateActor", async (actor, update, options, userId) => {
  update = SpellPoints.castSpell(actor, update);
});

/** spell launch dialog **/
// renderAbilityUseDialog renderApplication
Hooks.on("renderAbilityUseDialog", async (dialog, html, formData) => {
  console.log(MODULE_NAME, 'renderAbilityUseDialog');
  SpellPoints.checkDialogSpellPoints(dialog, html, formData);
})

/** attempt to calculate spellpoints on class item drop or class update**/
// const item = actor.items.find(i => i.name === "Items Name");
Hooks.on("updateOwnedItem", async (actor, item, update, diff, userId) => {
  console.log(MODULE_NAME, 'updateOwnedItem');
  //SpellPoints.calculateSpellPoints(actor, item, 'update');
})
Hooks.on("createOwnedItem", async (actor, item, options, userId) => {
  console.log(MODULE_NAME, 'createOwnedItem');
  //SpellPoints.calculateSpellPoints(actor, item, 'create');
})
Hooks.on("renderActorSheet5e", (app, html, data) => {
  console.log(MODULE_NAME, 'renderActorSheet5e');
  SpellPoints.mixedMode(app, html, data);
});

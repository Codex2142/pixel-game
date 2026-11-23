import React, { useState } from 'react';
import {
  ITEM_CATALOG,
  type InventorySlot,
  type ItemId,
} from '../game/rules/inventory.ts';
import {
  EQUIPMENT_CATALOG,
  type EquipmentLoadoutState,
  type EquipmentSlotId,
} from '../game/rules/equipment.ts';
import { eventBus, type HudSnapshot } from '../game/bridge/EventBus.ts';

interface InventoryModalProps {
  hud: HudSnapshot;
  slots: InventorySlot[];
  capacity: number;
  equipment: EquipmentLoadoutState;
  onClose: () => void;
}

const SLOT_LABELS: { slot: EquipmentSlotId; label: string }[] = [
  { slot: 'headgear', label: 'Headgear' },
  { slot: 'chest', label: 'Chest Armor' },
  { slot: 'legs', label: 'Leg Armor' },
  { slot: 'gloves', label: 'Gloves' },
  { slot: 'boots', label: 'Boots' },
  { slot: 'mainHand', label: 'Main-Hand' },
  { slot: 'offHand', label: 'Off-Hand' },
  { slot: 'accessory', label: 'Accessory' },
];

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  slots,
  capacity,
  equipment,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'equipment' | 'satchel'>('equipment');
  const [selectedEquipId, setSelectedEquipId] = useState<string>(
    equipment.equipped.mainHand ?? 'rondel_dagger'
  );
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(
    slots[0]?.itemId ?? null
  );

  const selectedEquipDef = EQUIPMENT_CATALOG[selectedEquipId] ?? null;
  const isSelectedEquipped =
    selectedEquipDef &&
    equipment.equipped[selectedEquipDef.slot] === selectedEquipDef.id;

  const selectedSlot = slots.find((s) => s.itemId === selectedItemId) ?? slots[0] ?? null;
  const selectedItemDef = selectedSlot ? ITEM_CATALOG[selectedSlot.itemId] : null;

  const paddedSlots: (InventorySlot | null)[] = Array.from(
    { length: capacity },
    (_, i) => slots[i] ?? null
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="hud-menu-btn"
              style={{
                borderColor: activeTab === 'equipment' ? '#f5d27a' : undefined,
                color: activeTab === 'equipment' ? '#f5d27a' : undefined,
              }}
              onClick={() => setActiveTab('equipment')}
            >
              MODULAR EQUIPMENT (8 LAYERS)
            </button>
            <button
              className="hud-menu-btn"
              style={{
                borderColor: activeTab === 'satchel' ? '#f5d27a' : undefined,
                color: activeTab === 'satchel' ? '#f5d27a' : undefined,
              }}
              onClick={() => setActiveTab('satchel')}
            >
              CONSUMABLES & RELICS ({slots.length}/{capacity})
            </button>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            [I / ESC] CLOSE
          </button>
        </div>

        {/* Live Attribute Readout Strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            background: 'rgba(12, 14, 22, 0.9)',
            border: '1px solid #4c5368',
            padding: '7px 12px',
            fontSize: '9px',
            marginBottom: '12px',
            color: '#f5d27a',
          }}
        >
          <span>MAX HP: {hud.maxHp}</span>
          <span>MAX STAM: {hud.maxStamina}</span>
          <span>ATK: {hud.attack}</span>
          <span>DEF: {hud.defense}</span>
          <span>CRIT: {hud.critChancePct}%</span>
          <span>
            WEAPON: {hud.activeWeaponKind.toUpperCase()}{' '}
            {hud.hasShield ? '+ SHIELD' : '(2H)'}
          </span>
        </div>

        {activeTab === 'equipment' ? (
          <div className="inventory-layout">
            {/* Left: 8 Active Equipment Slots + Owned Armory */}
            <div>
              <div style={{ fontSize: '9px', color: '#a6adbf', marginBottom: '6px' }}>
                EQUIPPED VISUAL LAYERS (CLICK TO INSPECT)
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '6px',
                  marginBottom: '12px',
                }}
              >
                {SLOT_LABELS.map(({ slot, label }) => {
                  const itemId = equipment.equipped[slot];
                  const def = itemId ? EQUIPMENT_CATALOG[itemId] : null;
                  const isShieldStored =
                    slot === 'offHand' &&
                    !def &&
                    hud.activeWeaponKind === 'greatsword' &&
                    equipment.storedShieldId;
                  return (
                    <div
                      key={slot}
                      onClick={() => {
                        if (def) setSelectedEquipId(def.id);
                        else if (isShieldStored && equipment.storedShieldId) {
                          setSelectedEquipId(equipment.storedShieldId);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(31, 34, 49, 0.92)',
                        border:
                          def && selectedEquipId === def.id
                            ? '2px solid #f5d27a'
                            : '1px solid #4c5368',
                        padding: '5px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      {def ? (
                        <img
                          src={def.icon}
                          alt={def.name}
                          style={{ width: '24px', height: '24px' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            border: '1px dashed #4c5368',
                          }}
                        />
                      )}
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '8px', color: '#a6adbf' }}>
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: '9px',
                            color: def ? '#f0ead8' : '#6c738a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {def
                            ? def.name
                            : isShieldStored
                            ? 'Stored (2H Active)'
                            : 'Unequipped'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: '9px', color: '#a6adbf', marginBottom: '6px' }}>
                ARMORY & ALTERNATE GEAR
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '6px',
                }}
              >
                {equipment.ownedEquipmentIds.map((id) => {
                  const def = EQUIPMENT_CATALOG[id];
                  if (!def) return null;
                  const equippedNow = equipment.equipped[def.slot] === id;
                  return (
                    <div
                      key={id}
                      className={`inv-slot ${selectedEquipId === id ? 'selected' : ''}`}
                      style={{ height: '44px' }}
                      onClick={() => setSelectedEquipId(id)}
                      title={def.name}
                    >
                      <img
                        src={def.icon}
                        alt={def.name}
                        style={{ width: '26px', height: '26px' }}
                      />
                      {equippedNow && (
                        <span
                          className="quick-key"
                          style={{ color: '#68f58c', fontSize: '7px' }}
                        >
                          EQ
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected Equipment Details & Equip/Unequip Actions */}
            <div className="inv-detail-pane">
              {selectedEquipDef ? (
                <>
                  <div>
                    <span className="item-tag">
                      SLOT: {selectedEquipDef.slot.toUpperCase()}
                    </span>
                    <h3
                      style={{
                        margin: '4px 0 6px',
                        fontSize: '13px',
                        color: '#f5d27a',
                      }}
                    >
                      {selectedEquipDef.name}
                    </h3>
                    <p
                      style={{
                        fontSize: '10px',
                        lineHeight: 1.55,
                        color: '#d4d8e8',
                        margin: '0 0 10px',
                      }}
                    >
                      {selectedEquipDef.description}
                    </p>
                    <div style={{ fontSize: '9px', color: '#7ee8fa' }}>
                      Visual Layer: <code>{selectedEquipDef.visualLayerKey}</code> (8-Dir Synced)
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {isSelectedEquipped ? (
                      selectedEquipDef.slot === 'mainHand' ? (
                        <button
                          className="rpg-btn"
                          disabled={!hud.combatState.canSwitchWeapon}
                          onClick={() =>
                            eventBus.emit('cmd:switchWeapon', undefined)
                          }
                        >
                          SWITCH TO{' '}
                          {selectedEquipDef.id === 'rondel_dagger'
                            ? 'GREATSWORD (2H)'
                            : 'RONDEL DAGGER'}
                        </button>
                      ) : (
                        <button
                          className="rpg-btn danger"
                          onClick={() =>
                            eventBus.emit('cmd:unequipSlot', {
                              slot: selectedEquipDef.slot,
                            })
                          }
                        >
                          UNEQUIP LAYER
                        </button>
                      )
                    ) : (
                      <button
                        className="rpg-btn"
                        onClick={() =>
                          eventBus.emit('cmd:equipItem', {
                            itemId: selectedEquipDef.id,
                          })
                        }
                      >
                        EQUIP {selectedEquipDef.name.toUpperCase()}
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="inventory-layout">
            {/* 12-Slot Backpack Grid */}
            <div className="inventory-grid">
              {paddedSlots.map((slot, idx) => {
                if (!slot) {
                  return <div key={`empty-${idx}`} className="inv-slot empty" />;
                }
                const def = ITEM_CATALOG[slot.itemId];
                const isSelected = selectedSlot?.itemId === slot.itemId;
                return (
                  <div
                    key={slot.itemId}
                    className={`inv-slot ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedItemId(slot.itemId)}
                  >
                    <img src={def.icon} alt={def.name} />
                    <span className="quick-qty">x{slot.quantity}</span>
                  </div>
                );
              })}
            </div>

            {/* Item Inspection & Use Panel */}
            <div className="inv-detail-pane">
              {selectedItemDef && selectedSlot ? (
                <>
                  <div>
                    <span
                      className={`item-tag ${
                        selectedItemDef.category === 'quest' ? 'quest' : ''
                      }`}
                    >
                      {selectedItemDef.category === 'quest'
                        ? 'QUEST RELIC'
                        : 'CONSUMABLE'}
                    </span>
                    <h3
                      style={{
                        margin: '4px 0 6px',
                        fontSize: '13px',
                        color: '#f5d27a',
                      }}
                    >
                      {selectedItemDef.name} (x{selectedSlot.quantity})
                    </h3>
                    <p
                      style={{
                        fontSize: '10px',
                        lineHeight: 1.55,
                        color: '#d4d8e8',
                        margin: 0,
                      }}
                    >
                      {selectedItemDef.description}
                    </p>
                  </div>

                  <div>
                    {selectedItemDef.category === 'consumable' ? (
                      <button
                        className="rpg-btn"
                        onClick={() =>
                          eventBus.emit('cmd:useItem', {
                            itemId: selectedItemDef.id,
                          })
                        }
                      >
                        CONSUME ITEM
                      </button>
                    ) : (
                      <button className="rpg-btn" disabled>
                        QUEST ITEM — CANNOT CONSUME
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '10px', color: '#9aa0b5' }}>
                  Select an item slot to inspect its properties.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

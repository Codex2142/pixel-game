import React from 'react';
import { eventBus, type CheckpointUiEntry } from '../game/bridge/EventBus.ts';

interface CheckpointModalProps {
  checkpoints: CheckpointUiEntry[];
  onClose: () => void;
}

export const CheckpointModal: React.FC<CheckpointModalProps> = ({
  checkpoints,
  onClose,
}) => {
  const handleTeleport = (id: string) => {
    eventBus.emit('cmd:teleport', { checkpointId: id });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">WAYSTONE FAST TRAVEL</h2>
          <button className="modal-close-btn" onClick={onClose}>
            [ESC] LEAVE SHRINE
          </button>
        </div>

        <p style={{ fontSize: '10px', color: '#c4cadb', marginTop: 0, marginBottom: '12px' }}>
          Your Wayfarer&apos;s Seal resonates with discovered Waystones across the Enchanted Forest.
          Select an awakened shrine to travel instantaneously.
        </p>

        <div className="checkpoint-list">
          {checkpoints.map((cp) => (
            <div
              key={cp.id}
              className={`checkpoint-row ${cp.isCurrent ? 'active' : ''}`}
            >
              <div>
                <div style={{ fontSize: '12px', color: cp.discovered ? '#f5d27a' : '#6c738a' }}>
                  {cp.discovered ? cp.name : '??? (Undiscovered Waystone)'}
                </div>
                <div style={{ fontSize: '9px', color: '#9aa0b5', marginTop: '2px' }}>
                  {cp.discovered ? cp.subtitle : 'Explore the eastern wilds to awaken this shrine.'}
                </div>
              </div>

              <div style={{ width: '130px' }}>
                {!cp.discovered ? (
                  <button className="rpg-btn" disabled>
                    LOCKED
                  </button>
                ) : cp.isCurrent ? (
                  <button className="rpg-btn" disabled>
                    HERE
                  </button>
                ) : (
                  <button
                    className="rpg-btn"
                    onClick={() => handleTeleport(cp.id)}
                  >
                    TELEPORT
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

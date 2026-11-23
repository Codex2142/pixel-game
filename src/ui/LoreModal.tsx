import React from 'react';

interface LoreModalProps {
  title: string;
  inscription: string;
  onClose: () => void;
}

export const LoreModal: React.FC<LoreModalProps> = ({
  title,
  inscription,
  onClose,
}) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            [ESC] CLOSE
          </button>
        </div>

        <p
          style={{
            fontSize: '11px',
            lineHeight: 1.7,
            color: '#e8e2d0',
            background: 'rgba(12, 14, 22, 0.85)',
            border: '1px solid #4c5368',
            padding: '14px',
            margin: '0 0 14px',
          }}
        >
          {inscription}
        </p>

        <button className="rpg-btn" onClick={onClose}>
          CONTINUE EXPLORATION
        </button>
      </div>
    </div>
  );
};

import React from "react";
import PropTypes from "prop-types";
import { motion } from "framer-motion";
import "../styles/Modal.css";

function Modal({ message, onConfirm, onCancel, showCancelButton }) {
  return (
    <div className="modal-overlay">
      <motion.div
        className="modal-content"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          {showCancelButton && (
            <button className="modal-btn cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="modal-btn confirm" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </motion.div>
    </div>
  );
}

Modal.propTypes = {
  message: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  showCancelButton: PropTypes.bool,
};

Modal.defaultProps = {
  showCancelButton: true,
  onCancel: () => {},
};

export default React.memo(Modal);
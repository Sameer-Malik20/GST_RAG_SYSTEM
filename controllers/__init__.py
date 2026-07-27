"""
GSTGPT Controllers Package
[MVC ROLE: CONTROLLER LAYER]
Is package me core application logic, query routing, evaluation, aur dataset orchestration classes hain.
"""

from controllers.training_controller import TrainingController

try:
    from controllers.chat_controller import ChatController
except ImportError:
    ChatController = None

try:
    from controllers.eval_controller import EvalController
except ImportError:
    EvalController = None

__all__ = ["ChatController", "EvalController", "TrainingController"]

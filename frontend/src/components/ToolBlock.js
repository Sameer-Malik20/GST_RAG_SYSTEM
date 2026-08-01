import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm-no-autolink';
import rehypeSanitize from 'rehype-sanitize';
import '../styles/ToolBlock.css';

const MAX_VISIBLE_RESULT_LENGTH = 1000;

function formatToolResultText(result) {
  const text = String(result ?? '');
  if (text.length <= MAX_VISIBLE_RESULT_LENGTH) return text;
  const omittedLength = text.length - MAX_VISIBLE_RESULT_LENGTH;
  return text.slice(0, MAX_VISIBLE_RESULT_LENGTH) + '\n\n... Tool output: omitted ' + omittedLength.toLocaleString() + ' characters';
}

function ToolBlock({ toolData }) {
  const isResult = toolData.type === 'tool_result';
  const isError = Boolean(toolData.is_error);
  const statusText = isError ? 'Failed' : 'Completed';
  const rawResultText = toolData.result;
  const formattedResultText = useMemo(() => formatToolResultText(rawResultText), [rawResultText]);

  return (
    <div className="tool-block-detail">
      <div className="tool-block-header">
        <span className="tool-block-title">{toolData.tool_name}</span>
        {isResult && (
          <span className={`tool-block-status ${isError ? 'error' : 'success'}`}>
            {statusText}
          </span>
        )}
      </div>

      {isResult && rawResultText && (
        <div className="tool-block-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              a: ({ children, ...props }) => (
                <a target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              )
            }}
          >
            {formattedResultText}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export default React.memo(ToolBlock);

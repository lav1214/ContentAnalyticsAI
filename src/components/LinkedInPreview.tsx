import { useState } from "react";
import { ThumbsUp, MessageCircle, Repeat2, Send, X, Globe } from "lucide-react";

interface LinkedInPreviewProps {
  content: string;
  format: "linkedinLong" | "linkedinShort" | "sponsoredAds";
  imageUrl?: string | null;
  onClose: () => void;
}

export function LinkedInPreview({ content, format, imageUrl, onClose }: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(true);

  const isAd = format === "sponsoredAds";

  const lines = content.split("\n");
  const truncatedLines = lines.slice(0, 3);
  const needsTruncation = !expanded && lines.length > 3;
  const displayContent = needsTruncation ? truncatedLines.join("\n") : content;

  const randomLikes = 34;
  const randomComments = 7;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" /> Post Preview
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preview card */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <div className="bg-white rounded-lg shadow-md overflow-hidden text-gray-900 max-w-[480px] mx-auto">
          {/* Author */}
          <div className="p-3 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">Y</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[13px] text-gray-900">Your Name</p>
              <p className="text-[11px] text-gray-500 leading-tight">Your headline · {isAd ? "Promoted" : "1h"}</p>
              <Globe className="w-2.5 h-2.5 text-gray-400 mt-0.5" />
            </div>
            {isAd && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Sponsored</span>
            )}
          </div>

          {/* Content */}
          <div className="px-3 pb-2">
            <div className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              {displayContent}
              {needsTruncation && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-gray-500 hover:text-blue-600 font-medium ml-1"
                >
                  ...see more
                </button>
              )}
            </div>
          </div>

          {/* Image */}
          {imageUrl && (
            <img src={imageUrl} alt="Post image" className="w-full object-cover max-h-[280px]" />
          )}

          {/* Engagement */}
          <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-gray-500 border-b border-gray-100">
            <div className="flex items-center gap-1">
              <span className="flex -space-x-1">
                <span className="w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center">
                  <ThumbsUp className="w-2 h-2 text-white" />
                </span>
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px]">❤</span>
              </span>
              <span className="ml-1">{randomLikes}</span>
            </div>
            <span>{randomComments} comments</span>
          </div>

          {/* Actions */}
          <div className="px-2 py-0.5 flex items-center justify-around">
            {[
              { icon: ThumbsUp, label: "Like" },
              { icon: MessageCircle, label: "Comment" },
              { icon: Repeat2, label: "Repost" },
              { icon: Send, label: "Send" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1 px-3 py-2 text-[11px] font-medium text-gray-500"
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-3 opacity-60">
          Approximate preview — actual rendering may vary
        </p>
      </div>
    </div>
  );
}

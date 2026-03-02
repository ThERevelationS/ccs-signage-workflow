import React from "react";

export default function ExtractedContentDisplay({ extractedText }) {
  if (!extractedText) return null;

  // Clean and format the extracted text
  const cleanText = extractedText
    .replace(/\s+/g, ' ')
    .trim();

  // Break into paragraphs (roughly every 300-400 chars)
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [];
  const paragraphs = [];
  let currentPara = '';

  sentences.forEach(sentence => {
    currentPara += sentence;
    if (currentPara.length > 300) {
      paragraphs.push(currentPara);
      currentPara = '';
    }
  });
  if (currentPara) paragraphs.push(currentPara);

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-gray-700">Key Information</p>
      <div className="space-y-2 max-h-48 overflow-y-auto bg-white p-2 rounded border border-gray-200">
        {paragraphs.slice(0, 5).map((para, i) => (
          <p key={i} className="text-xs text-gray-700 leading-relaxed">
            {para.trim()}
          </p>
        ))}
        {paragraphs.length > 5 && (
          <p className="text-xs text-gray-500 italic">
            ... and {paragraphs.length - 5} more sections
          </p>
        )}
      </div>
    </div>
  );
}
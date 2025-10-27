import { Modal, ModalContent, ModalHeader, ModalBody } from "@nextui-org/react";
import { 
  QuestionMarkCircleIcon,
  KeyboardIcon,
  SparklesIcon 
} from "@heroicons/react/20/solid";

export default function HelpModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            transition: {
              duration: 0.3,
              ease: "easeOut",
            },
          },
          exit: {
            y: -20,
            opacity: 0,
            transition: {
              duration: 0.2,
              ease: "easeIn",
            },
          },
        },
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <QuestionMarkCircleIcon className="w-6 h-6" />
          <span>Help & Shortcuts</span>
        </ModalHeader>
        <ModalBody className="pb-8">
          <div className="space-y-6">
            {/* Keyboard Shortcuts */}
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <KeyboardIcon className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-lg">Keyboard Shortcuts</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ShortcutItem 
                  keys={["Ctrl", "K"]}
                  description="Focus search bar"
                />
                <ShortcutItem 
                  keys={["Esc"]}
                  description="Clear search"
                />
                <ShortcutItem 
                  keys={["Space"]}
                  description="Play/Pause current sample"
                />
                <ShortcutItem 
                  keys={["Ctrl", "/"]}
                  description="Open settings"
                />
                <ShortcutItem 
                  keys={["H"]}
                  description="Open help"
                />
                <ShortcutItem 
                  keys={["Ctrl", "H"]}
                  description="Toggle help modal"
                />
              </div>
            </div>

            {/* Features */}
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <SparklesIcon className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-lg">Features</h3>
              </div>
              <div className="space-y-3 text-sm text-gray-400">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <div>
                    <strong className="text-white">Real-time Search:</strong> Search through millions of Splice samples with instant results
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                  <div>
                    <strong className="text-white">Audio Preview:</strong> Listen to samples before downloading (hover to preload)
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <strong className="text-white">Drag & Drop:</strong> Drag samples directly into your DAW from the desktop app
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
                  <div>
                    <strong className="text-white">Advanced Filters:</strong> Filter by key, BPM, genre, instrument, and more
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-pink-500 rounded-full mt-2"></div>
                  <div>
                    <strong className="text-white">Smart Suggestions:</strong> Click tags to add them to your search filters
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-lg p-4 border border-purple-500/20">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <span className="text-2xl">💡</span>
                <span>Pro Tips</span>
              </h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div>• Use exact BPM for precise tempo matching</div>
                <div>• Combine multiple filters for refined results</div>
                <div>• Hover over samples to preload audio for instant playback</div>
                <div>• Open pack covers to visit the pack on Splice</div>
                <div>• Samples auto-organize by pack in your download folder</div>
              </div>
            </div>

            {/* About */}
            <div className="border-t border-gray-800 pt-4 text-center text-xs text-gray-500">
              <p>Built with passion, attention to detail, and zero AI assistance</p>
              <p className="mt-2 opacity-75">Every line of code crafted by human hands ✨</p>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

function ShortcutItem({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded hover:bg-gray-800/50 transition-colors">
      <div className="flex gap-1.5">
        {keys.map((key, index) => (
          <kbd 
            key={index}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded font-mono text-xs font-semibold border border-gray-700 shadow-sm"
          >
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-sm text-gray-400">{description}</span>
    </div>
  );
}


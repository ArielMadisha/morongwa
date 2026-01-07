import Link from 'next/link';
import { ArrowRight, Package, UserCircle, Shield, MessageSquare } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Package className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">Morongwa</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors inline-flex items-center"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6">
            Your tasks, our runners.
            <span className="block text-blue-600 mt-2">Simple as that.</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Connect with trusted errand runners who get things done. Post a task or earn money by helping others.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/register"
              className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 font-semibold text-lg transition-colors inline-flex items-center justify-center"
            >
              Post a Task
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/register"
              className="bg-white text-blue-600 px-8 py-4 rounded-lg hover:bg-gray-50 font-semibold text-lg border-2 border-blue-600 transition-colors inline-flex items-center justify-center"
            >
              Become a Runner
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-32 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <UserCircle className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Trusted Runners</h3>
            <p className="text-gray-600">
              All runners are verified and rated by the community. Choose who you trust with your tasks.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Secure Payments</h3>
            <p className="text-gray-600">
              Your payment is held securely in escrow until the task is completed to your satisfaction.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Chat</h3>
            <p className="text-gray-600">
              Stay in touch with your runner through our built-in messaging system.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-32 bg-white rounded-3xl shadow-xl p-12">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Post Your Task</h3>
              <p className="text-gray-600">Describe what you need done and set your budget</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Get Matched</h3>
              <p className="text-gray-600">Nearby runners accept your task and get to work</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Task Complete</h3>
              <p className="text-gray-600">Review your runner and payment is released</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white mt-20 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Package className="h-6 w-6 text-blue-600" />
              <span className="text-lg font-bold text-gray-900">Morongwa</span>
            </div>
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Morongwa. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

